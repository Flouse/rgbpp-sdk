import { AddressPrefix } from '@nervosnetwork/ckb-sdk-utils';
import { blockchain } from '@ckb-lumos/base';
import { buildMintTx, Collector } from 'ckb-omiga';

// SECP256K1 private key
const TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';

const mintXudt = async () => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });

  const address = collector.getCkb().utils.privateKeyToAddress(TEST_PRIVATE_KEY, { prefix: AddressPrefix.Testnet });
  // ckt1qyq0n2dd28k3fymdx0mmhp224ma973arej7s9jvjju
  console.log('address: ', address);

  const mintLimit = BigInt(1000) * BigInt(10 ** 8);
  const inscriptionId = '0xd378891e711cf5c612321b7f51529215187403c61cbb27bc4413fded871b73d5';

  const rawTx = await buildMintTx({ collector, address, inscriptionId, mintLimit });

  const secp256k1Dep: CKBComponents.CellDep = {
    outPoint: {
      txHash: '0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37',
      index: '0x0',
    },
    depType: 'depGroup',
  };
  const witnessArgs = blockchain.WitnessArgs.unpack(rawTx.witnesses[0]) as CKBComponents.WitnessArgs;
  let unsignedTx: CKBComponents.RawTransactionToSign = {
    ...rawTx,
    cellDeps: [...rawTx.cellDeps, secp256k1Dep],
    witnesses: [witnessArgs, ...rawTx.witnesses.slice(1)],
  };
  const signedTx = collector.getCkb().signTransaction(TEST_PRIVATE_KEY)(unsignedTx);

  let txHash = await collector.getCkb().rpc.sendTransaction(signedTx, 'passthrough');
  console.info(`Xudt has been minted with tx hash ${txHash}`);
};

mintXudt();

