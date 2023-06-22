const { Scalar } = require('ffjavascript');

const constants = require('./constants');
const getPoseidon = require('./poseidon');
const { scalar2fea, stringToH4 } = require('./smt-utils');
/**
 * Leaf type 11:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([receiptKey[0:4], receiptKey[4:8], receiptKey[8:12], receiptKey[12:16], receiptKey[16:20], 0, SMT_KEY_RECEIPT, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} txIndex - current tx index
 * @returns {Scalar} - key computed
 */
// TODO: different file
// TODO: unit testing
// TODO: add specs to hackmd and slides
async function keyReceiptTree(txIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_RECEIPT);
    const receiptKey = scalar2fea(F, Scalar.e(txIndex));

    const key1 = [receiptKey[0], receiptKey[1], receiptKey[2], receiptKey[3], receiptKey[4], receiptKey[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

/**
 * Leaf type 10:
 *   hk0: H([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])
 *   key: H([logIndexKey[0:4], logIndexKey[4:8], logIndexKey[8:12], logIndexKey[12:16], logIndexKey[16:20], 0, SMT_KEY_LOGS, 0], [hk0[0], hk0[1], hk0[2], hk0[3]])
 * @param {Number} logIndex - current log index
 * @returns {Scalar} - key computed
 */
async function keyLogsTree(logIndex) {
    const poseidon = await getPoseidon();
    const { F } = poseidon;

    const constant = F.e(constants.SMT_KEY_LOGS);
    const logIndexKey = scalar2fea(F, Scalar.e(logIndex));

    const key1 = [logIndexKey[0], logIndexKey[1], logIndexKey[2], logIndexKey[3], logIndexKey[4], logIndexKey[5], constant, F.zero];
    const key1Capacity = stringToH4(constants.HASH_POSEIDON_ALL_ZEROES);

    return poseidon(key1, key1Capacity);
}

module.exports = {
    keyReceiptTree,
    keyLogsTree,
};
