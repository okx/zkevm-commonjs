/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-console */
/* eslint-disable multiline-comment-style */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

const { Scalar } = require('ffjavascript');
const fs = require('fs');

const ethers = require('ethers');
const { expect } = require('chai');
const {
    Address, toBuffer,
} = require('ethereumjs-util');
const { defaultAbiCoder } = require('@ethersproject/abi');
const path = require('path');

const artifactsPath = path.join(__dirname, 'artifacts/contracts');

const {
    MemDB, ZkEVMDB, getPoseidon, processorUtils,
} = require('../index');
const testVectors = require('./helpers/processor-tests.json');
const newTestVectors = require('./helpers/processor-tests.json');

const replace = false;

describe('Processor', async function () {
    this.timeout(100000);
    let poseidon;
    let F;

    before(async () => {
        poseidon = await getPoseidon();
        F = poseidon.F;
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                id,
                arity,
                genesis,
                expectedOldRoot,
                txs,
                expectedNewRoot,
                chainIdSequencer,
                sequencerAddress,
                expectedNewLeafs,
                batchL2Data,
                localExitRoot,
                globalExitRoot,
                batchHashData,
                inputHash,
                timestamp,
            } = testVectors[i];

            const db = new MemDB(F);

            // create a zkEVMDB to compile the sc
            const zkEVMDB = await ZkEVMDB.newZkEVM(
                db,
                arity,
                poseidon,
                F.zero,
                F.e(Scalar.e(localExitRoot)),
                genesis,
            );

            // Check evm contract params
            for (const contract of genesis) {
                if (contract.contractName) {
                // Add contract interface for future contract interaction
                    const contractInterface = new ethers.utils.Interface(contract.abi);
                    contract.contractInterface = contractInterface;
                    const contractAddres = new Address(toBuffer(contract.address));

                    const contractAccount = await zkEVMDB.vm.stateManager.getAccount(contractAddres);
                    expect(await contractAccount.isContract()).to.be.true;

                    const contractCode = await zkEVMDB.vm.stateManager.getContractCode(contractAddres);
                    expect(contractCode.toString('hex')).to.be.equal(contract.deployedBytecode.slice(2));

                    for (const [key, value] of Object.entries(contract.storage)) {
                        const contractStorage = await zkEVMDB.vm.stateManager.getContractStorage(contractAddres, toBuffer(key));
                        expect(contractStorage.toString('hex')).to.equal(value.slice(2));
                    }
                }
            }
            if (!replace) {
                expect(`0x${Scalar.e(F.toString(zkEVMDB.stateRoot)).toString(16).padStart(64, '0')}`).to.be.equal(expectedOldRoot);
            } else {
                newTestVectors[i].expectedOldRoot = `0x${Scalar.e(F.toString(zkEVMDB.stateRoot)).toString(16).padStart(64, '0')}`;
            }
            /*
             * build, sign transaction and generate rawTxs
             * rawTxs would be the calldata inserted in the contract
             */
            const txProcessed = [];
            const rawTxs = [];
            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];

                const tx = {
                    to: txData.to,
                    nonce: txData.nonce,
                    value: processorUtils.toHexStringRlp(ethers.utils.parseUnits(txData.value, 'wei')),
                    gasLimit: txData.gasLimit,
                    gasPrice: processorUtils.toHexStringRlp(ethers.utils.parseUnits(txData.gasPrice, 'wei')),
                    chainId: txData.chainId,
                    data: txData.data || '0x',
                };

                // The tx will have paramsDeploy in case is a deployment with constructor
                // let params = '';
                // if (txData.paramsDeploy) {
                //     params = defaultAbiCoder.encode(txData.paramsDeploy.types, txData.paramsDeploy.values);
                //     tx.data += params.slice(2);
                // }

                if (txData.data) {
                    if (txData.to) {
                        if (txData.contractName) {
                            // Call to genesis contract
                            const contract = genesis.find((x) => x.contractName === txData.contractName);
                            const functionData = contract.contractInterface.encodeFunctionData(txData.function, txData.params);
                            delete contract.contractInterface;
                            expect(functionData).to.equal(txData.data);
                        }
                    } else {
                        // Contract deployment from tx
                        delete tx.to;

                        const { bytecode } = require(`${artifactsPath}/${txData.contractName}.sol/${txData.contractName}.json`);
                        const params = defaultAbiCoder.encode(txData.paramsDeploy.types, txData.paramsDeploy.values);
                        expect(tx.data).to.equal(bytecode + params.slice(2));
                    }
                }

                if ((tx.to && tx.to !== '0x0' && !ethers.utils.isAddress(tx.to)) || !ethers.utils.isAddress(txData.from)) {
                    expect(txData.customRawTx).to.equal(undefined);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                let customRawTx;
                const address = genesis.find((o) => o.address === txData.from);
                const wallet = new ethers.Wallet(address.pvtKey);
                if (tx.chainId === 0) {
                    const signData = ethers.utils.RLP.encode([
                        processorUtils.toHexStringRlp(Scalar.e(tx.nonce)),
                        processorUtils.toHexStringRlp(tx.gasPrice),
                        processorUtils.toHexStringRlp(tx.gasLimit),
                        processorUtils.toHexStringRlp(tx.to),
                        processorUtils.toHexStringRlp(tx.value),
                        processorUtils.toHexStringRlp(tx.data),
                        processorUtils.toHexStringRlp(tx.chainId),
                        '0x',
                        '0x',
                    ]);
                    const digest = ethers.utils.keccak256(signData);
                    const signingKey = new ethers.utils.SigningKey(address.pvtKey);
                    const signature = signingKey.signDigest(digest);
                    const r = signature.r.slice(2).padStart(64, '0'); // 32 bytes
                    const s = signature.s.slice(2).padStart(64, '0'); // 32 bytes
                    const v = (signature.v).toString(16).padStart(2, '0'); // 1 bytes
                    customRawTx = signData.concat(r).concat(s).concat(v);
                } else {
                    const rawTxEthers = await wallet.signTransaction(tx);
                    expect(rawTxEthers).to.equal(txData.rawTx);
                    customRawTx = processorUtils.rawTxToCustomRawTx(rawTxEthers);
                }

                expect(customRawTx).to.equal(txData.customRawTx);

                if (txData.encodeInvalidData) {
                    customRawTx = customRawTx.slice(0, -6);
                }
                rawTxs.push(customRawTx);
                txProcessed.push(txData);
            }

            const batch = await zkEVMDB.buildBatch(timestamp, sequencerAddress, chainIdSequencer, F.e(Scalar.e(globalExitRoot)));
            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }

            // execute the transactions added to the batch
            await batch.executeTxs();
            // consolidate state
            await zkEVMDB.consolidate(batch);

            const newRoot = batch.currentStateRoot;
            expect(`0x${Scalar.e(F.toString(newRoot)).toString(16).padStart(64, '0')}`).to.be.equal(expectedNewRoot);

            // Check errors on decode transactions
            const decodedTx = await batch.getDecodedTxs();

            for (let j = 0; j < decodedTx.length; j++) {
                const currentTx = decodedTx[j];
                const expectedTx = txProcessed[j];
                try {
                    expect(currentTx.reason).to.be.equal(expectedTx.reason);
                } catch (error) {
                    console.log({ currentTx }, { expectedTx }); // eslint-disable-line no-console
                    throw new Error(`Batch Id : ${id} TxId:${expectedTx.id} ${error}`);
                }
            }

            // Check balances and nonces
            for (const [address, leaf] of Object.entries(expectedNewLeafs)) {
                // EVM
                const newLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(newLeaf.balance.toString()).to.equal(leaf.balance);
                expect(newLeaf.nonce.toString()).to.equal(leaf.nonce);
                // SMT
                const smtNewLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(smtNewLeaf.balance.toString()).to.equal(leaf.balance);
                expect(smtNewLeaf.nonce.toString()).to.equal(leaf.nonce);
            }

            // Check the circuit input
            const circuitInput = await batch.getCircuitInput();

            // Check the encode transaction match with the vector test
            if (!replace) {
                expect(batchL2Data).to.be.equal(batch.getBatchL2Data());
                // Check the batchHashData and the input hash
                expect(batchHashData).to.be.equal(circuitInput.batchHashData);
                expect(inputHash).to.be.equal(circuitInput.inputHash);
            } else {
                newTestVectors[i].batchL2Data = batch.getBatchL2Data();
                newTestVectors[i].batchHashData = circuitInput.batchHashData;
                newTestVectors[i].inputHash = circuitInput.inputHash;
                delete newTestVectors[i].contractInterface;
            }

            console.log(`Completed test ${i + 1}/${testVectors.length}`);
        }
        if (replace) {
            await fs.writeFileSync(path.join(__dirname, './helpers/processor-tests.json'), JSON.stringify(newTestVectors, null, 2));
        }
    });
});
