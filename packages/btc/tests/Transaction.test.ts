import { describe, expect, it } from 'vitest';
import { ErrorCodes, AddressType, sendBtc, sendUtxos, tweakSigner } from '../src';
import { bitcoin, ErrorMessages, BTC_UTXO_DUST_LIMIT, RGBPP_UTXO_DUST_LIMIT } from '../src';
import { accounts, network, service, source } from './shared/env';
import { expectPsbtFeeInRange } from './shared/utils';

describe('Transaction', () => {
  describe('sendBtc()', () => {
    describe('Transfer from Native SegWit (P2WPKH) address', () => {
      const addresses = [
        { type: 'Taproot (P2TR)', address: accounts.charlie.p2tr.address },
        { type: 'Native SegWit (P2WPKH)', address: accounts.charlie.p2wpkh.address },
        { type: 'Nested SegWit (P2SH)', address: '2N4gkVAQ1f6bi8BKon8MLKEV1pi85MJWcPV' },
        { type: 'Legacy (P2PKH)', address: 'mqkAgjy8gfrMZh1VqV5Wm1Yi4G9KWLXA1Q' },
      ];
      addresses.forEach((addressInfo, index) => {
        it(`Transfer to ${addressInfo.type} address`, async () => {
          if (index !== 0) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }

          const psbt = await sendBtc({
            from: accounts.charlie.p2wpkh.address,
            tos: [
              {
                address: addressInfo.address,
                value: 1000,
              },
            ],
            source,
          });

          // Sign & finalize inputs
          psbt.signAllInputs(accounts.charlie.keyPair);
          psbt.finalizeAllInputs();

          console.log('tx paid fee:', psbt.getFee());
          expectPsbtFeeInRange(psbt);

          // Broadcast transaction
          // const tx = psbt.extractTransaction();
          // const res = await service.sendTransaction(tx.toHex());
          // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
        }, 10000);
      });
    });
    it('Transfer from Taproot (P2TR) address', async () => {
      const psbt = await sendBtc({
        from: accounts.charlie.p2tr.address,
        fromPubkey: accounts.charlie.publicKey,
        tos: [
          {
            address: accounts.charlie.p2tr.address,
            value: 1000,
          },
        ],
        source,
      });

      // Create a tweaked signer
      const tweakedSigner = tweakSigner(accounts.charlie.keyPair, {
        network,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(tweakedSigner);
      psbt.finalizeAllInputs();

      console.log(psbt.txInputs);
      console.log(psbt.txOutputs);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });

    it('Transfer with an impossible "minUtxoSatoshi" filter', async () => {
      const balance = await service.getBalance(accounts.charlie.p2wpkh.address, {
        min_satoshi: BTC_UTXO_DUST_LIMIT,
      });

      await expect(() =>
        sendBtc({
          from: accounts.charlie.p2wpkh.address,
          tos: [
            {
              address: accounts.charlie.p2wpkh.address,
              value: 1000,
            },
          ],
          minUtxoSatoshi: balance.satoshi + 1,
          source,
        }),
      ).rejects.toThrow(ErrorMessages[ErrorCodes.INSUFFICIENT_UTXO]);
    });
    it('Transfer with an extra OP_RETURN output', async () => {
      const psbt = await sendBtc({
        from: accounts.charlie.p2wpkh.address,
        tos: [
          {
            data: Buffer.from('00'.repeat(32), 'hex'),
            value: 0,
          },
          {
            address: accounts.charlie.p2wpkh.address,
            value: 1000,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      const outputs = psbt.txOutputs;
      expect(outputs).toHaveLength(3);

      const opReturnOutput = outputs[0];
      expect(opReturnOutput).toBeDefined();
      expect(opReturnOutput.script).toBeDefined();

      const scripts = bitcoin.script.decompile(opReturnOutput.script);
      expect(scripts).toBeDefined();

      const op = scripts![0];
      expect(op).toBeTypeOf('number');
      expect(op).toBe(bitcoin.opcodes.OP_RETURN);

      const data = scripts![1];
      expect(data).toBeInstanceOf(Buffer);
      expect((data as Buffer).toString('hex')).toEqual('00'.repeat(32));

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
  });

  describe('sendUtxos()', () => {
    it('Transfer fixed UTXO, sum(ins) = sum(outs)', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 1000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 1000,
            fixed: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs.length).toBeGreaterThanOrEqual(2);
      expect(psbt.txOutputs).toHaveLength(2);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer fixed UTXO, sum(ins) < sum(outs)', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 1000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 2000,
            fixed: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs.length).toBeGreaterThanOrEqual(2);
      expect(psbt.txOutputs).toHaveLength(2);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer fixed UTXO, sum(ins) > sum(outs)', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 2000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 1500,
            fixed: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs.length).toBeGreaterThanOrEqual(2);
      expect(psbt.txOutputs).toHaveLength(2);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer fixed UTXO, and the fee is prepaid', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 3000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 1856,
            fixed: true,
          },
          {
            address: accounts.charlie.p2wpkh.address,
            value: 1000,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs).toHaveLength(1);
      expect(psbt.txOutputs).toHaveLength(2);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });

    it('Transfer protected UTXO, sum(ins) = sum(outs)', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 2000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 2,
            value: 2000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 2000,
            protected: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      console.log(psbt.data.inputs.map((row) => row.finalScriptWitness!.byteLength));

      expect(psbt.txInputs).toHaveLength(2);
      expect(psbt.txOutputs).toHaveLength(1);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer protected UTXO, sum(ins) < sum(outs)', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 1000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 2000,
            protected: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs.length).toBeGreaterThanOrEqual(2);
      expect(psbt.txOutputs).toHaveLength(2);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer protected UTXO, sum(ins) > sum(outs), change to outs[0]', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: 2000,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            value: 1500,
            protected: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs).toHaveLength(1);
      expect(psbt.txOutputs).toHaveLength(1);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });

    it('Transfer protected RGBPP_UTXOs, sum(ins) = sum(outs)', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: RGBPP_UTXO_DUST_LIMIT,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 2,
            value: RGBPP_UTXO_DUST_LIMIT,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT,
            protected: true,
          },
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT,
            protected: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      expect(psbt.txInputs.length).toBeGreaterThanOrEqual(3);
      expect(psbt.txOutputs).toHaveLength(3);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer protected RGBPP_UTXOs, each has free satoshi', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: (RGBPP_UTXO_DUST_LIMIT + 100) * 3,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT + 100,
            protected: true,
          },
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT + 100,
            protected: true,
          },
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT + 100,
            protected: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      console.log(psbt.txOutputs);
      expect(psbt.txInputs).toHaveLength(1);
      expect(psbt.txOutputs).toHaveLength(3);
      expect(psbt.txOutputs[0].value).toBeLessThan(psbt.txOutputs[1].value);
      expect(psbt.txOutputs[1].value).toBeLessThan(psbt.txOutputs[2].value);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
    it('Transfer protected RGBPP_UTXOs, with insufficient free satoshi', async () => {
      const psbt = await sendUtxos({
        from: accounts.charlie.p2wpkh.address,
        inputs: [
          {
            txid: '4e1e9f8ff4bf245793c05bf2da58bff812c332a296d93c6935fbc980d906e567',
            vout: 1,
            value: RGBPP_UTXO_DUST_LIMIT * 2 + 100,
            addressType: AddressType.P2WPKH,
            address: accounts.charlie.p2wpkh.address,
            scriptPk: accounts.charlie.p2wpkh.scriptPubkey.toString('hex'),
          },
        ],
        outputs: [
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT + 100,
            protected: true,
          },
          {
            address: accounts.charlie.p2wpkh.address,
            minUtxoSatoshi: RGBPP_UTXO_DUST_LIMIT,
            value: RGBPP_UTXO_DUST_LIMIT,
            protected: true,
          },
        ],
        source,
      });

      // Sign & finalize inputs
      psbt.signAllInputs(accounts.charlie.keyPair);
      psbt.finalizeAllInputs();

      console.log(psbt.txOutputs);
      expect(psbt.txInputs.length).toBeGreaterThanOrEqual(2);
      expect(psbt.txOutputs).toHaveLength(3);
      expect(psbt.txOutputs[0].value).toBe(RGBPP_UTXO_DUST_LIMIT);
      expect(psbt.txOutputs[1].value).toBe(RGBPP_UTXO_DUST_LIMIT);

      console.log('tx paid fee:', psbt.getFee());
      expectPsbtFeeInRange(psbt);

      // Broadcast transaction
      // const tx = psbt.extractTransaction();
      // const res = await service.sendTransaction(tx.toHex());
      // console.log(`explorer: https://mempool.space/testnet/tx/${res.txid}`);
    });
  });

  describe.todo('sendRgbppUtxos()', () => {
    // TODO: fill tests
  });
});
