/* eslint-disable no-restricted-globals */
/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
/* eslint-disable prefer-destructuring */

const totalSteps = 2 ** 23;
const MCPL = 23;
let MCP = 128;
module.exports = class VirtualCountersManager {
    /**
     * constructor class
     * @param {Object} config - database
     * @param {Boolean} config.verbose - Activate or deactivate verbose mode, default: false
     */
    constructor(config = {}) {
        this.verbose = config.verbose || false;
        // Compute counter initial amounts
        this.currentCounters = {
            S: {
                amount: totalSteps,
                name: 'steps',
                initAmount: totalSteps,
            },
            A: {
                amount: Math.floor(totalSteps / 32),
                name: 'arith',
                initAmount: Math.floor(totalSteps / 32),
            },
            B: {
                amount: Math.floor(totalSteps / 16),
                name: 'binary',
                initAmount: Math.floor(totalSteps / 16),
            },
            M: {
                amount: Math.floor(totalSteps / 32),
                name: 'memAlign',
                initAmount: Math.floor(totalSteps / 32),
            },
            K: {
                amount: Math.floor((totalSteps / 155286) * 44),
                name: 'keccaks',
                initAmount: Math.floor((totalSteps / 155286) * 44),
            },
            D: {
                amount: Math.floor(totalSteps / 56),
                name: 'padding',
                initAmount: Math.floor(totalSteps / 56),
            },
            P: {
                amount: Math.floor(totalSteps / 30),
                name: 'poseidon',
                initAmount: Math.floor(totalSteps / 30),
            },
        };
        this.currentCountersSnapshot = {};
        this.customSnapshots = [];
        this.calledFunc = '';
        this.skipCounters = config.skipCounters || false;
    }

    /**
     *
     * @param {String} functionName function name identifier
     * @param {Object} inputsObject Inputs to pass to the function execution
     * @returns Virtual counters consumption of function execution
     */
    computeFunctionCounters(functionName, inputsObject = {}) {
        try {
            this.calledFunc = functionName;
            this._verbose(`Computing counters for function ${functionName}`);
            const func = this[functionName];
            this.initSnapshot();
            if (func && typeof func === 'function') {
                this[functionName](inputsObject);
            } else {
                this._checkCounters();
                this._throwError(`Invalid function ${functionName}`);
            }

            return this.getSnapshotConsumption();
        } catch (e) {
            this._verbose(`Error computing counters for function ${this.calledFunc}`);
            this._verbose(e);
            this._throwError(e);
        }
    }

    /**
     * Set sparse merkle tree levels for poseidon counters computation
     * @param {Number} levels number of levels
     */
    setSMTLevels(levels) {
        MCP = levels;
    }

    /**
     * Inits main counters snapshot to monitor current function call consumption
     */
    initSnapshot() {
        this.currentCountersSnapshot = JSON.parse(JSON.stringify(this.currentCounters));
    }

    /**
     * Retrieves current virtual counters consumption
     * @returns Object with vcounters consumption
     */
    getSnapshotConsumption() {
        const spentCounters = {};
        Object.keys(this.currentCountersSnapshot).forEach((counter) => {
            spentCounters[this.currentCountersSnapshot[counter].name] = this.currentCountersSnapshot[counter].amount - this.currentCounters[counter].amount;
        });
        this._verbose(spentCounters);
        this.currentCountersSnapshot = spentCounters;

        return spentCounters;
    }

    /**
     * Inits custom snapshot
     * @param {String} id snapshot identifier
     */
    initCustomSnapshot(id) {
        this.customSnapshots[id] = JSON.parse(JSON.stringify(this.currentCounters));
    }

    /**
     * Retrieves custom snapshot consumption
     * @returns Object with vcounters consumption
     */
    computeCustomSnapshotConsumption(id) {
        if (!this.customSnapshots[id]) {
            this._throwError(`Invalid snapshot id ${id}`);
        }
        const spentCounters = {};
        Object.keys(this.customSnapshots[id]).forEach((counter) => {
            spentCounters[this.customSnapshots[id][counter].name] = this.customSnapshots[id][counter].amount - this.currentCounters[counter].amount;
        });

        return spentCounters;
    }
    /**
     *
     * FUNCTIONS
     *
     */

    batchProcessing(input) {
        this._checkInput(input, ['batchL2DataLength']);
        this._initBatchProcessing(input.batchL2DataLength);
        this._failAssert();
        this._consolidateBlock();
        this._finishBatchProcessing();
    }

    rlpParsing(input) {
        this._checkInput(input, ['txRLPLength', 'txDataLen']);
        this._reduceCounters(250, 'S');
        this._reduceCounters(3 + 1, 'B');
        this._reduceCounters(Math.ceil(input.txRLPLength / 136), 'K');
        this._reduceCounters(Math.ceil(input.txRLPLength / 56), 'P');
        this._reduceCounters(Math.ceil(input.txRLPLength / 56), 'D');
        this._multiCall('_addBatchHashData', 21);
        /**
         * We need to calculate the counters consumption of `_checkNonLeadingZeros`, which calls `_getLenBytes`
         * _checkNonLeadingZeros is called 7 times
         * The worst case scenario each time `_checkNonLeadingZeros`+ `_getLenBytes` is called is the following:
         * readList -> aprox 300000 bytes -> the size can be expressed qith 3 bytes -> len(hex(300000)) = 3 bytes
         * gasPrice -> 256 bits -> 1 bytes
         * gasLimit -> 64 bits -> 1 bytes
         * value -> 256 bits -> 1 bytes
         * dataLen -> 300000 bytes -> 3 bytes
         * chainId -> 64 bits -> 1 bytes
         * total max bytes: 10 bytes
         */
        this._reduceCounters(6 * 7, 'S'); // Steps to call _checkNonLeadingZeros 7 times
        [3, 1, 1, 1, 3, 1].forEach((bytesLen) => {
            this._getLenBytes({ lenBytesInput: bytesLen });
        });
        this._divArith();
        this._multiCall('_addHashTx', 9 + Math.floor(input.txDataLen / 32));
        this._multiCall('_addL2HashTx', 8 + Math.floor(input.txDataLen / 32));
        this._multiCall('_addBatchHashByteByByte', input.txDataLen);
        this._SHLarith();
        this._ecrecoverTx();
    }

    decodeChangeL2BlockTx() {
        this._reduceCounters(20, 'S');
        this._multiCall('_addBatchHashData', 3);
    }

    processTx(input) {
        this._checkInput(input, ['bytecodeLength', 'isDeploy']);
        this._reduceCounters(300, 'S');
        this._reduceCounters(12 + 7, 'B');
        this._reduceCounters(14 * MCP, 'P');
        this._reduceCounters(5, 'D');
        this._reduceCounters(2, 'A');
        this._reduceCounters(1, 'K');
        this._multiCall('_isColdAddress', 2);
        this._multiCall('_addArith', 3);
        this._subArith();
        this._divArith();
        this._multiCall('_mulArith', 4);
        this._fillBlockInfoTreeWithTxReceipt();
        this._processContractCall({ ...input, ...{ isCreate: false, isCreate2: false } });
    }

    processChangeL2Block() {
        this._reduceCounters(70, 'S');
        this._reduceCounters(4 + 4, 'B');
        this._reduceCounters(6 * MCP, 'P');
        this._reduceCounters(2, 'K');
        this._consolidateBlock();
        this._setupNewBlockInfoTree();
    }

    preECRecover() {
        this._reduceCounters(35, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_readFromCalldataOffset', 4);
        this._ecrecoverTx();
        this._mStore32();
        this._mStoreX();
    }

    preIdentity(input) {
        this._checkInput(input, ['calldataLength', 'returnDataLength']);
        this._reduceCounters(45, 'S');
        this._reduceCounters(2, 'B');
        this._divArith();
        // identity loop
        this._multiCall('_identityLoop', Math.floor(input.calldataLength / 32));
        this._readFromCalldataOffset();
        this._mStoreX();
        // identity return loop
        this._multiCall('_identityReturnLoop', Math.floor(input.returnDataLength / 32));
        this._mLoadX();
        this._mStoreX();
    }

    _identityLoop() {
        this._reduceCounters(8, 'S');
        this._readFromCalldataOffset();
        this._mStore32();
    }

    _identityReturnLoop() {
        this._reduceCounters(12, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opAdd(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opMul(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._mulArith();
    }

    opSub(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    opDiv(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._divArith();
    }

    opSDiv(input) {
        this._opcode(input);
        this._reduceCounters(25, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_abs', 2);
        this._divArith();
    }

    opMod(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
        this._divArith();
    }

    opSMod(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
        this._reduceCounters(1, 'B');
        this._multiCall('_abs', 2);
        this._divArith();
    }

    opAddMod(input) {
        this._opcode(input);
        this._reduceCounters(30, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(1, 'A');
    }

    opMulMod(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._utilMulMod();
    }

    opExp(input) {
        this._opcode(input);
        this._checkInput(input, ['bytesExponentLength']);
        this._reduceCounters(10, 'S');
        this._getLenBytes({ lenBytesInput: input.bytesExponentLength });
        this._expAd({ lenBitsInput: input.bytesExponentLength * 8 });
    }

    opSignExtend(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
        this._reduceCounters(6, 'B');
        this._reduceCounters(2 * MCP, 'P');
    }

    opBlockHash(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._reduceCounters(MCP, 'P');
        this._reduceCounters(1, 'K');
    }

    opCoinbase(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opTimestamp(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opNumber(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opDifficulty(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opGasLimit(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opChainId(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opCalldataLoad(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._readFromCalldataOffset();
    }

    opCalldataSize(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
    }

    opCalldataCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(100, 'S');
        this._reduceCounters(2, 'B');
        this._saveMem();
        this._offsetUtil();
        this._multiCall('_opCalldataCopyLoop', Math.floor(input.inputSize / 32));
        this._readFromCalldataOffset();
        this._multiCall('_mStoreX', 2);
    }

    _opCalldataCopyLoop() {
        this._reduceCounters(30, 'S');
        this._readFromCalldataOffset();
        this._offsetUtil();
        this._reduceCounters(1, 'M');
    }

    opCodeSize(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opExtCodeSize(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
        this._maskAddress();
        this._isColdAddress();
    }

    opExtCodeCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['bytecodeLen', 'inputSize']);
        this._reduceCounters(60, 'S');
        this._maskAddress();
        this._isColdAddress();
        this._reduceCounters(2 * MCP + Math.ceil(input.bytecodeLen / 56), 'P');
        this._reduceCounters(Math.ceil(input.bytecodeLen / 56), 'D');
        this._multiCall('_divArith', 2);
        this._saveMem();
        this._mulArith();
        this._reduceCounters(input.inputSize, 'M');
        this._multiCall('_opCodeCopyLoop', input.inputSize);
        this._reduceCounters(1, 'B');
    }

    opCodeCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize', 'isCreate', 'isDeploy']);
        if (input.isCreate || input.isDeploy) {
            this.opCalldataCopy(input);
        } else {
            this._reduceCounters(40, 'S');
            this._reduceCounters(3, 'B');
            this._saveMem();
            this._divArith();
            this._mulArith();
            this._multiCall('_opCodeCopyLoop', input.inputSize);
        }
    }

    _opCodeCopyLoop() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
    }

    opReturnDataSize(input) {
        this._opcode(input);
        this._reduceCounters(11, 'S');
        this._reduceCounters(1, 'B');
    }

    opReturnDataCopy(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(50, 'S');
        this._reduceCounters(2, 'B');
        this._saveMem();
        this._divArith();
        this._mulArith();
        this._multiCall('_returnDataCopyLoop', Math.floor(input.inputSize / 32));
        this._mLoadX();
        this._mStoreX();
    }

    _returnDataCopyLoop() {
        this._reduceCounters(10, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opExtCodeHash(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
        this._maskAddress();
        this._isColdAddress();
    }

    opLT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opGT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opSLT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opSGT(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opEq(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opIsZero(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
    }

    opAnd(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opOr(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opXor(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opNot(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opByte(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._reduceCounters(2, 'B');
        this._SHRarith();
    }

    opSHR(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
        this._SHRarithBit();
    }

    opSHL(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(1, 'B');
        this._SHLarithBit();
    }

    opSAR(input) {
        this._opcode(input);
        this._reduceCounters(25, 'S');
        this._reduceCounters(5, 'B');
        this._SHRarithBit();
    }

    opStop(input) {
        this._opcode(input);
        this._reduceCounters(20, 'S');
    }

    opCreate(input) {
        this._opcode(input);
        this._checkInput(input, ['bytesNonceLength']);
        this._reduceCounters(70, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(3 * MCP, 'P');
        this._saveMem();
        this._getLenBytes({ lenBytesInput: input.bytesNonceLength });
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opCall(input) {
        this._opcode(input);
        this._reduceCounters(80, 'S');
        this._reduceCounters(5, 'B');
        this._maskAddress();
        this._multiCall('_saveMem', 2);
        this._isColdAddress();
        this._isEmptyAccount();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opCallCode(input) {
        this._opcode(input);
        this._reduceCounters(80, 'S');
        this._reduceCounters(5, 'B');
        this._maskAddress();
        this._multiCall('_saveMem', 2);
        this._isColdAddress();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opDelegateCall(input) {
        this._opcode(input);
        this._reduceCounters(80, 'S');
        this._maskAddress();
        this._multiCall('_saveMem', 2);
        this._isColdAddress();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opStaticCall(input) {
        this._opcode(input);
        this._reduceCounters(80, 'S');
        this._maskAddress();
        this._multiCall('_saveMem', 2);
        this._isColdAddress();
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opCreate2(input) {
        this._opcode(input);
        this._checkInput(input, ['bytesNonceLength']);
        this._reduceCounters(80, 'S');
        this._reduceCounters(4, 'B');
        this._reduceCounters(2 * MCP, 'P');
        this._saveMem();
        this._divArith();
        this._getLenBytes({ lenBytesInput: input.bytesNonceLength });
        this._computeGasSendCall();
        this._saveCalldataPointer();
        this._checkpointBlockInfoTree();
        this._checkpointTouched();
    }

    opReturn(input) {
        this._opcode(input);
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(30, 'S');
        this._reduceCounters(1, 'B');
        this._saveMem();
        if (input.isCreate || input.isDeploy) {
            if (input.isCreate) {
                this._checkInput(input, ['returnLength']);
                this._reduceCounters(25, 'S');
                this._reduceCounters(2, 'B');
                this._reduceCounters(2 * MCP, 'P');
                this._checkBytecodeStartsEF();
                this._hashPoseidonLinearFromMemory({ memSize: input.returnLength });
            }
        } else {
            this._checkInput(input, ['returnLength']);
            this._multiCall('_opReturnLoop', Math.floor(input.returnLength / 32));
            this._mLoadX();
            this._mStoreX();
        }
    }

    _opReturnLoop() {
        this._reduceCounters(12, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opRevert(input) {
        this._opcode(input);
        this._checkInput(input, ['revertSize']);
        this._reduceCounters(40, 'S');
        this._reduceCounters(1, 'B');
        this._revertTouched();
        this._revertBlockInfoTree();
        this._saveMem();
        this._multiCall('_opRevertLoop', Math.floor(input.revertSize / 32));
        this._mLoadX();
        this._mStoreX();
    }

    _opRevertLoop() {
        this._reduceCounters(12, 'S');
        this._mLoad32();
        this._mStore32();
    }

    opSendAll(input) {
        this._opcode(input);
        this._reduceCounters(60, 'S');
        this._reduceCounters(2 + 1, 'B');
        this._reduceCounters(4 * MCP, 'P');
        this._maskAddress();
        this._isEmptyAccount();
        this._isColdAddress();
        this._addArith();
    }

    opInvalid(input) {
        this._opcode(input);
        this._reduceCounters(50, 'S');
    }

    opAddress(input) {
        this._opcode(input);
        this._reduceCounters(6, 'S');
    }

    opSelfBalance(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(MCP, 'P');
    }

    opBalance(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._reduceCounters(MCP, 'P');
        this._maskAddress();
        this._isColdAddress();
    }

    opOrigin(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opCaller(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opCallValue(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opGasPrice(input) {
        this._opcode(input);
        this._reduceCounters(5, 'S');
    }

    opGas(input) {
        this._opcode(input);
        this._reduceCounters(4, 'S');
    }

    opSha3(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(40, 'S');
        this._reduceCounters(Math.ceil(input.inputSize / 32) + 1, 'K');
        this._saveMem();
        this._multiCall('_divArith', 2);
        this._mulArith();
        this._multiCall('_opSha3Loop', Math.floor(input.inputSize / 32));
        this._mLoadX();
        this._SHRarith();
    }

    _opSha3Loop() {
        this._reduceCounters(8, 'S');
        this._mLoad32();
    }

    opJump(input) {
        this._opcode(input);
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(5, 'S');
        this._checkJumpDest(input);
    }

    opJumpI(input) {
        this._opcode(input);
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
        this._checkJumpDest(input);
    }

    _checkJumpDest(input) {
        this._checkInput(input, ['isCreate', 'isDeploy']);
        this._reduceCounters(10, 'S');
        if (input.isCreate) {
            this._reduceCounters(1, 'B');
            if (input.isDeploy) {
                this._mLoadX();
            }
        }
    }

    opPC(input) {
        this._opcode(input);
        this._reduceCounters(4, 'S');
    }

    opJumpDest(input) {
        this._opcode(input);
        this._reduceCounters(2, 'S');
    }

    opLog0(input) {
        this._opLog(input);
    }

    opLog1(input) {
        this._opLog(input);
    }

    opLog2(input) {
        this._opLog(input);
    }

    opLog3(input) {
        this._opLog(input);
    }

    opLog4(input) {
        this._opLog(input);
    }

    _opLog(input) {
        this._opcode(input);
        this._checkInput(input, ['inputSize']);
        this._reduceCounters(30 + 8 * 4, 'S'); // Count steps as if topics is 4
        this._saveMem();
        this._mulArith();
        this._divArith();
        this._reduceCounters(Math.ceil(input.inputSize / 56) + 4, 'P');
        this._reduceCounters(Math.ceil(input.inputSize / 56) + 4, 'D');
        this._multiCall('_opLogLoop', Math.floor(input.inputSize / 32));
        this._mLoadX();
        this._SHRarith();
        this._fillBlockInfoTreeWithLog();
        this._reduceCounters(1, 'B');
    }

    _opLogLoop() {
        this._reduceCounters(10, 'S');
        this._mLoad32();
    }

    opPush0(input) {
        this._opcode(input);
        this._reduceCounters(4, 'S');
    }

    _opPush1(input) {
        this._opPush({ pushBytes: 1, ...input });
    }

    _opPush2(input) {
        this._opPush({ pushBytes: 2, ...input });
    }

    _opPush3(input) {
        this._opPush({ pushBytes: 3, ...input });
    }

    _opPush4(input) {
        this._opPush({ pushBytes: 4, ...input });
    }

    _opPush5(input) {
        this._opPush({ pushBytes: 5, ...input });
    }

    _opPush6(input) {
        this._opPush({ pushBytes: 6, ...input });
    }

    _opPush7(input) {
        this._opPush({ pushBytes: 7, ...input });
    }

    _opPush8(input) {
        this._opPush({ pushBytes: 8, ...input });
    }

    _opPush9(input) {
        this._opPush({ pushBytes: 9, ...input });
    }

    _opPush10(input) {
        this._opPush({ pushBytes: 10, ...input });
    }

    _opPush11(input) {
        this._opPush({ pushBytes: 11, ...input });
    }

    _opPush12(input) {
        this._opPush({ pushBytes: 12, ...input });
    }

    _opPush13(input) {
        this._opPush({ pushBytes: 13, ...input });
    }

    _opPush14(input) {
        this._opPush({ pushBytes: 14, ...input });
    }

    _opPush15(input) {
        this._opPush({ pushBytes: 15, ...input });
    }

    _opPush16(input) {
        this._opPush({ pushBytes: 16, ...input });
    }

    _opPush17(input) {
        this._opPush({ pushBytes: 17, ...input });
    }

    _opPush18(input) {
        this._opPush({ pushBytes: 18, ...input });
    }

    _opPush19(input) {
        this._opPush({ pushBytes: 19, ...input });
    }

    _opPush20(input) {
        this._opPush({ pushBytes: 20, ...input });
    }

    _opPush21(input) {
        this._opPush({ pushBytes: 21, ...input });
    }

    _opPush22(input) {
        this._opPush({ pushBytes: 22, ...input });
    }

    _opPush23(input) {
        this._opPush({ pushBytes: 23, ...input });
    }

    _opPush24(input) {
        this._opPush({ pushBytes: 24, ...input });
    }

    _opPush25(input) {
        this._opPush({ pushBytes: 25, ...input });
    }

    _opPush26(input) {
        this._opPush({ pushBytes: 26, ...input });
    }

    _opPush27(input) {
        this._opPush({ pushBytes: 27, ...input });
    }

    _opPush28(input) {
        this._opPush({ pushBytes: 28, ...input });
    }

    _opPush29(input) {
        this._opPush({ pushBytes: 29, ...input });
    }

    _opPush30(input) {
        this._opPush({ pushBytes: 30, ...input });
    }

    _opPush31(input) {
        this._opPush({ pushBytes: 31, ...input });
    }

    _opPush32(input) {
        this._opPush({ pushBytes: 32, ...input });
    }

    _opPush(input) {
        this._opcode(input);
        this._checkInput(input, ['pushBytes', 'isCreate', 'isDeploy']);
        this._reduceCounters(4, 'S');
        if (input.isCreate || input.isDeploy) {
            this._reduceCounters(1, 'B');
            if (input.isCreate) {
                this._reduceCounters(20, 'S');
                this._mLoadX();
                this._SHRarith();
            } else {
                this._reduceCounters(10, 'S');
                for (let i = 0; i < input.pushBytes; i++) {
                    this._reduceCounters(10, 'S');
                    this._SHLarith();
                }
            }
        } else {
            this._reduceCounters(10, 'S');
            this._readPush(input);
        }
    }

    opDup1(input) {
        this._opDup(input);
    }

    opDup2(input) {
        this._opDup(input);
    }

    opDup3(input) {
        this._opDup(input);
    }

    opDup4(input) {
        this._opDup(input);
    }

    opDup5(input) {
        this._opDup(input);
    }

    opDup6(input) {
        this._opDup(input);
    }

    opDup7(input) {
        this._opDup(input);
    }

    opDup8(input) {
        this._opDup(input);
    }

    opDup9(input) {
        this._opDup(input);
    }

    opDup10(input) {
        this._opDup(input);
    }

    opDup11(input) {
        this._opDup(input);
    }

    opDup12(input) {
        this._opDup(input);
    }

    opDup13(input) {
        this._opDup(input);
    }

    opDup14(input) {
        this._opDup(input);
    }

    opDup15(input) {
        this._opDup(input);
    }

    opDup16(input) {
        this._opDup(input);
    }

    _opDup(input) {
        this._opcode(input);
        this._reduceCounters(6, 'S');
    }

    opSwap1(input) {
        this._opSwap(input);
    }

    opSwap2(input) {
        this._opSwap(input);
    }

    opSwap3(input) {
        this._opSwap(input);
    }

    opSwap4(input) {
        this._opSwap(input);
    }

    opSwap5(input) {
        this._opSwap(input);
    }

    opSwap6(input) {
        this._opSwap(input);
    }

    opSwap7(input) {
        this._opSwap(input);
    }

    opSwap8(input) {
        this._opSwap(input);
    }

    opSwap9(input) {
        this._opSwap(input);
    }

    opSwap10(input) {
        this._opSwap(input);
    }

    opSwap11(input) {
        this._opSwap(input);
    }

    opSwap12(input) {
        this._opSwap(input);
    }

    opSwap13(input) {
        this._opSwap(input);
    }

    opSwap14(input) {
        this._opSwap(input);
    }

    opSwap15(input) {
        this._opSwap(input);
    }

    opSwap16(input) {
        this._opSwap(input);
    }

    _opSwap(input) {
        this._opcode(input);
        this._reduceCounters(7, 'S');
    }

    opPop(input) {
        this._opcode(input);
        this._reduceCounters(3, 'S');
    }

    opMLoad(input) {
        this._opcode(input);
        this._reduceCounters(8, 'S');
        this._saveMem();
        this._mLoad32();
    }

    opMStore(input) {
        this._opcode(input);
        this._reduceCounters(22, 'S');
        this._reduceCounters(1, 'M');
        this._saveMem();
        this._offsetUtil();
    }

    opMStore8(input) {
        this._opcode(input);
        this._reduceCounters(13, 'S');
        this._reduceCounters(1, 'M');
        this._saveMem();
        this._offsetUtil();
    }

    opMSize(input) {
        this._opcode(input);
        this._reduceCounters(15, 'S');
        this._divArith();
    }

    opSLoad(input) {
        this._opcode(input);
        this._reduceCounters(10, 'S');
        this._reduceCounters(MCP, 'P');
        this._isColdSlot();
    }

    opSStore(input) {
        this._opcode(input);
        this._reduceCounters(70, 'S');
        this._reduceCounters(8, 'B');
        this._reduceCounters(3 * MCP, 'P');
        this._isColdSlot();
    }

    _opcode(input) {
        this._reduceCounters(12, 'S');
        if (input.isCreate2 || input.isCreate || input.isDeploy) {
            this._mLoadX();
            this._SHRarith();
        }
    }
    /**
     *
     * UTILS
     *
     */

    _expAd(input) {
        this._checkInput(input, ['lenBitsInput']);
        this._reduceCounters(30, 'S');
        this._reduceCounters(2, 'B');
        this._getLenBits({ lenBitsInput: input.lenBitsInput });
        for (let i = 0; i < input.lenBitsInput; i++) {
            this._reduceCounters(12, 'S');
            this._reduceCounters(2, 'B');
            this._divArith();
            this._mulArith();
            this._mulArith();
        }
    }

    _getLenBits(input) {
        this._checkInput(input, ['lenBitsInput']);
        this._reduceCounters(12, 'S');
        for (let i = 0; i < input.lenBitsInput; i++) {
            this._reduceCounters(9, 'S');
            this._reduceCounters(1, 'B');
            this._divArith();
        }
    }

    _setupNewBlockInfoTree() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(6, 'B');
        this._reduceCounters(6 * MCPL, 'P');
    }

    _isColdSlot() {
        this._reduceCounters(20, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(2 * MCPL, 'P');
    }

    _readPush(input) {
        this._checkInput(input, ['pushBytes']);
        this._reduceCounters(15, 'S');
        this._reduceCounters(1, 'B');

        const numBlocks = Math.ceil(input.pushBytes / 4);
        const leftBytes = input.pushBytes % 4;

        for (let i = 0; i < numBlocks; i++) {
            this._reduceCounters(20, 'S');
            this._reduceCounters(1, 'B');
            for (let j = i - 1; j > 0; j--) {
                this._reduceCounters(8, 'S');
            }
        }

        for (let i = 0; i < leftBytes; i++) {
            this._reduceCounters(40, 'S');
            this._reduceCounters(4, 'B');
        }
    }

    _fillBlockInfoTreeWithLog() {
        this._reduceCounters(11, 'S');
        this._reduceCounters(MCPL, 'P');
    }

    _revertTouched() {
        this._reduceCounters(2, 'S');
    }

    _revertBlockInfoTree() {
        this._reduceCounters(4, 'S');
    }

    _hashPoseidonLinearFromMemory(input) {
        this._checkInput(input, ['memSize']);
        this._reduceCounters(50, 'S');
        this._reduceCounters(1 + 1, 'B');
        this._reduceCounters(Math.ceil(input.memSize / 56), 'P');
        this._reduceCounters(Math.ceil(input.memSize / 56), 'D');
        this._divArith();
        this._multiCall('_hashPoseidonLinearFromMemoryLoop', Math.floor(input.memSize / 32));
        this._mLoadX();
        this._SHRarith();
    }

    _hashPoseidonLinearFromMemoryLoop() {
        this._reduceCounters(8, 'S');
        this._mLoad32();
    }

    _checkBytecodeStartsEF() {
        this._reduceCounters(20, 'S');
        this._mLoadX();
        this._SHRarith();
    }

    _isEmptyAccount() {
        this._reduceCounters(30, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(3 * MCP, 'P');
    }

    _saveCalldataPointer() {
        this._reduceCounters(6, 'S');
    }

    _checkpointTouched() {
        this._reduceCounters(2, 'S');
    }

    _checkpointBlockInfoTree() {
        this._reduceCounters(4, 'S');
    }

    _computeGasSendCall() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(2, 'B');
    }

    _maskAddress() {
        this._reduceCounters(6, 'S');
        this._reduceCounters(1, 'B');
    }

    _SHLarithBit() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(2, 'A');
    }

    _SHRarithBit() {
        this._reduceCounters(30, 'S');
        this._reduceCounters(2, 'B');
        this._divArith();
    }

    _offsetUtil() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    _mLoad32() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._SHRarith();
        this._SHLarith();
    }

    _mLoadX() {
        this._reduceCounters(40, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._SHRarith();
        this._SHLarith();
    }

    _mStoreX() {
        this._reduceCounters(100, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._multiCall('_SHRarith', 2);
        this._multiCall('_SHLarith', 2);
    }

    _mStore32() {
        this._reduceCounters(100, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(1, 'M');
        this._offsetUtil();
        this._multiCall('_SHRarith', 2);
        this._multiCall('_SHLarith', 2);
    }

    _saveMem() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(5, 'B');
        this._mulArith();
        this._divArith();
    }

    _readFromCalldataOffset() {
        this._reduceCounters(25, 'S');
        this._mLoadX();
    }

    _utilMulMod() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(4, 'B');
        this._reduceCounters(2, 'A');
        this._mulArith();
    }

    _abs() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(2, 'B');
    }

    _consolidateBlock() {
        this._reduceCounters(20, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(2 * MCPL, 'P');
    }

    _ecrecoverTx() {
        this._reduceCounters(6400, 'S');
        this._reduceCounters(1600, 'B');
        this._reduceCounters(1100, 'A');
        this._reduceCounters(1, 'K');
    }

    _processContractCall(input) {
        this._checkInput(input, ['bytecodeLength', 'isDeploy']);
        this._reduceCounters(40, 'S');
        this._reduceCounters(4 + 1, 'B');
        this._reduceCounters(1, 'P');
        this._reduceCounters(1, 'D');
        this._reduceCounters(2 * MCP, 'P');
        this._moveBalances();

        if (input.isDeploy || input.isCreate || input.isCreate2) {
            // End deploy
            this._reduceCounters(15, 'S');
            this._reduceCounters(2, 'B');
            this._reduceCounters(2 * MCP, 'P');
            this._checkBytecodeStartsEF();
            this._hashPoseidonLinearFromMemory({ memSize: input.bytecodeLength });
            if (input.isCreate) {
                this._reduceCounters(40, 'S');
                this._reduceCounters(1, 'K');
                this._maskAddress();
            } else if (input.isCreate2) {
                this._reduceCounters(40, 'S');
                this._divArith();
                this._reduceCounters(Math.ceil(input.bytecodeLength / 136) + 1, 'K');
                this._multiCall('_mLoad32', Math.floor(input.bytecodeLength / 32));
                this._mLoadX();
                this._SHRarith();
                this._reduceCounters(1, 'K');
                this._maskAddress();
            }
        } else {
            this._reduceCounters(Math.ceil(input.bytecodeLength / 56), 'P');
            this._reduceCounters(Math.ceil(input.bytecodeLength / 56), 'D');
            this._divArith();
        }
    }

    _initBatchProcessing(batchL2DataLength) {
        // MCP + 100S + divArith + batchL2DataLength/136K + K
        this._reduceCounters(100, 'S');
        this._reduceCounters(MCP, 'P');
        this._divArith();
        this._reduceCounters(Math.ceil(batchL2DataLength / 136), 'K');
    }

    _moveBalances() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(3 + 2, 'B');
        this._reduceCounters(4 * MCP, 'P');
    }

    _fillBlockInfoTreeWithTxReceipt() {
        this._reduceCounters(20, 'S');
        this._reduceCounters(3 * MCPL, 'P');
    }

    _addArith() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    _subArith() {
        this._reduceCounters(10, 'S');
        this._reduceCounters(1, 'B');
    }

    _mulArith() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(1, 'B');
        this._reduceCounters(1, 'A');
    }

    _isColdAddress() {
        this._reduceCounters(100, 'S');
        this._reduceCounters(2 + 1, 'B');
        this._reduceCounters(2 * MCPL, 'P');
    }

    _SHLarith() {
        this._reduceCounters(100, 'S');
        this._reduceCounters(4, 'B');
        this._reduceCounters(2, 'A');
    }

    _addHashTx() {
        this._reduceCounters(10, 'S');
    }

    _addL2HashTx() {
        this._reduceCounters(10, 'S');
    }

    _addBatchHashByteByByte() {
        this._reduceCounters(25, 'S');
        this._reduceCounters(1, 'B');
        this._SHRarith();
        this._addBatchHashData();
    }

    _getLenBytes(input) {
        this._checkInput(input, ['lenBytesInput']);
        this._reduceCounters(input.lenBytesInput * 7 + 12, 'S');
        this._reduceCounters(input.lenBytesInput * 1, 'B');
        this._multiCall('_SHRarith', input.lenBytesInput);
    }

    _SHRarith() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(2, 'B');
        this._reduceCounters(1, 'A');
        this._divArith();
    }

    _addBatchHashData() {
        this._reduceCounters(10, 'S');
    }

    _finishBatchProcessing() {
        this._reduceCounters(200, 'S');
        this._reduceCounters(1, 'K');
        this._reduceCounters(MCP, 'P');
    }

    _divArith() {
        this._reduceCounters(50, 'S');
        this._reduceCounters(3, 'B');
        this._reduceCounters(1, 'A');
    }

    _failAssert() {
        this._reduceCounters(2, 'S');
    }

    /**
     *
     * HELPERS
     *
     */

    /**
     * Calls a function multiple times
     * @param {String} functionName identifier
     * @param {Number} times Number of function calls
     * @param {Object} input function object
     */
    _multiCall(functionName, times, input) {
        for (let i = 0; i < times; i += 1) {
            this[functionName](input);
        }
    }

    /**
     * Checks object contains keys
     * @param {Object} input input function object
     * @param {Array} keys Array of keys to check
     */
    _checkInput(input = {}, keys = []) {
        // Check input object has keys
        keys.forEach((key) => {
            if (typeof input[key] === 'boolean') {
                input[key] = input[key] ? 1 : 0;
            }
            if (typeof input[key] !== 'number') {
                this._throwError(`Missing or invalid input ${key} at function ${this.calledFunc}`);
            }
        });
    }

    /**
     * Reduces counter by amount
     * @param {Number} amount vcounters to reduce
     * @param {String} counterType identifier
     */
    _reduceCounters(amount, counterType) {
        if (isNaN(amount)) this._throwError(`Invalid amount ${amount}`);
        if (!this.currentCounters[counterType]) this._throwError(`Invalid counter type ${counterType}`);
        this.currentCounters[counterType].amount -= amount;
        // this._verbose(`Reducing ${this.currentCounters[counterType].name} by ${amount} -> current amount: ${this.currentCounters[counterType].amount}`);
        this._checkCounter(counterType);
    }

    _checkCounters() {
        Object.keys(this.currentCounters).forEach((counter) => {
            this._checkCounter(counter);
        });
    }

    /**
     * Checks if counter is below 0, only if skipCounters is false
     * @param {String} counterType identifier
     */
    _checkCounter(counterType) {
        if (this.currentCounters[counterType].amount <= 0) {
            if (!this.skipCounters) {
                this._throwError(`Out of counters ${this.currentCounters[counterType].name}`);
            }
        }
    }

    _throwError(message) {
        throw new Error(message);
    }

    _verbose(message) {
        if (this.verbose) {
            console.log(message);
        }
    }

    /**
     * Retrieves current virtual counters consumption since instantiation of class
     * @returns {Object} Spent counters
     */
    getCurrentSpentCounters() {
        const spentCounters = {};
        Object.keys(this.currentCounters).forEach((counter) => {
            spentCounters[this.currentCounters[counter].name] = this.currentCounters[counter].initAmount - this.currentCounters[counter].amount;
        });
        this._verbose(spentCounters);

        return spentCounters;
    }
};
