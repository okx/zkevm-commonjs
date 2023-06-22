/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
const smtUtils = require('./smt-utils');
const receiptKeysUtils = require('./receipt-keys-utils');
/**
 * Add new entry to receipts tree
 * @param {Number} status current tx status
 * @param {String} gasUsed gasUsed in current tx as hex string withouth 0x
 * @param {String} logsRoot logsRoot in current tx as hex string withouth 0x
 * @param {Number} txIndex current tx index
 * @param {Array[Field]} initRoot merkle tree init root
 * @param {Object} smt merkle tree structure
 * @param {Array[Field]} root merkle tree root
 * @returns {Array[Field]} new state root
 */
async function computeReceiptsTree(status, gasUsed, logsRoot, txIndex, initRoot, smt) {
    const receiptValue = `0x${String(status).padStart(2, '0')}${gasUsed.padStart(16, '0')}${logsRoot.padStart(64, '0')}`;
    const hashedReceiptValue = await smtUtils.linearPoseidon(receiptValue);
    const newRoot = await setTxReceipt(txIndex, smt, hashedReceiptValue, initRoot);

    return newRoot;
}

/**
 * Set tx receipt to receipts tree
 * @param {Number} txIndex current tx index
 * @param {Object} smt merkle tree structure
 * @param {String} receiptHash linear poseidon hash of receipt value H(status + gasUsed + logsRoot)
 * @param {Array[Field]} root merkle tree root
 * @returns {Array[Field]} new state root
 */
async function setTxReceipt(txIndex, smt, receiptHash, root) {
    // Get smt key from txIndex
    const key = await receiptKeysUtils.keyReceiptTree(txIndex);
    // Put log value in smt
    const res = await smt.set(root, key, receiptHash);

    return res.newRoot;
}

/**
 * Set log to logs tree
 * @param {Number} logIndex current tx index
 * @param {Object} smt merkle tree structure
 * @param {String} logHash linear poseidon hash of log value H(topics + data)
 * @param {Array[Field]} root merkle tree root
 * @returns {Array[Field]} new state root
 */
async function setLog(logIndex, smt, logHash, root) {
    // Get smt key from txIndex
    const key = await receiptKeysUtils.keyLogsTree(logIndex);
    // Put log value in smt
    const res = await smt.set(root, key, logHash);

    return res.newRoot;
}

/**
 * Computes root from array of logs
 * @param {Array[Field]} logs logs object [address, topics, data]
 * @param {Array[Field]} initRoot merkle tree init root
 * @param {Object} smt merkle tree structure
 * @returns {Array[Field]} new state root
 */
async function computeLogsTree(logs, initRoot, smt) {
    // Loop logs
    let logIndex = 0;
    let currentLogsRoot = initRoot;
    for (const log of logs) {
        const bTopics = log[1];
        const topics = bTopics.reduce((previousValue, currentValue) => previousValue + currentValue.toString('hex'), '');
        const encoded = await smtUtils.linearPoseidon(`0x${log[2].toString('hex')}${topics}`);
        currentLogsRoot = await setLog(logIndex, smt, encoded, currentLogsRoot);
        logIndex += 1;
    }

    return currentLogsRoot;
}

module.exports = {
    setLog,
    computeLogsTree,
    setTxReceipt,
    computeReceiptsTree,
};
