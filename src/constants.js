const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

// Database keys
module.exports.DB_LAST_BATCH = ethers.utils.id(('ZKEVM_DB_LAST_BATCH'));
module.exports.DB_STATE_ROOT = ethers.utils.id(('ZKEVM_DB_STATE_ROOT'));
module.exports.DB_ACC_BLOB_HASH = ethers.utils.id(('ZKEVM_DB_ACC_BLOB_HASH'));
module.exports.DB_LOCAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_LOCAL_EXIT_ROOT'));
module.exports.DB_GLOBAL_EXIT_ROOT = ethers.utils.id(('ZKEVM_DB_GLOBAL_EXIT_ROOT'));
module.exports.DB_ADDRESS_STORAGE = ethers.utils.id(('ZKEVM_DB_ADDRESS_STORAGE'));
module.exports.DB_TOUCHED_ACCOUNTS = ethers.utils.id(('ZKEVM_DB_TOUCHED_ACCOUNTS'));
module.exports.DB_STARK_INPUT = ethers.utils.id(('ZKEVM_DB_STARK_INPUT'));
module.exports.DB_COMPRESSOR_ADDRESS = ethers.utils.id(('COMPRESSOR_ADDRESS'));
module.exports.DB_COMPRESSOR_32_BYTES = ethers.utils.id(('COMPRESSOR_32_BYTES'));

// Default values and global constants
module.exports.DEFAULT_MAX_TX = 1000;
module.exports.SIGNATURE_BYTES = 32 + 32 + 1;
module.exports.FrSNARK = Scalar.e('21888242871839275222246405745257275088548364400416034343698204186575808495617');
module.exports.FrSTARK = Scalar.e('18446744069414584321');

// SMT blob-tree constant keys
module.exports.SMT_KEY_BLOB_CONSTANT = 7;
module.exports.SMT_KEY_BLOB_LAST_ADDRESS_INDEX = 0;
module.exports.SMT_KEY_BLOB_LAST_DATA_INDEX = 1;
module.exports.SMT_KEY_BLOB_ADDRESS_ROOT = 2;
module.exports.SMT_KEY_BLOB_DATA_ROOT = 3;

// SMT address tree constants
module.exports.SMT_KEY_ADDRESS_INDEX = 8;

// SMT data tree constants
module.exports.SMT_KEY_DATA_INDEX = 9;

// SMT state-tree constant keys
module.exports.SMT_KEY_BALANCE = 0;
module.exports.SMT_KEY_NONCE = 1;
module.exports.SMT_KEY_SC_CODE = 2;
module.exports.SMT_KEY_SC_STORAGE = 3;
module.exports.SMT_KEY_SC_LENGTH = 4;

// SMT touched-tree constant keys
module.exports.SMT_KEY_TOUCHED_ADDR = 5;
module.exports.SMT_KEY_TOUCHED_SLOTS = 6;
module.exports.SMT_KEY_LOGS = 10;
module.exports.SMT_KEY_RECEIPT = 11;

// SMT constant
module.exports.BYTECODE_ELEMENTS_HASH = 8;
module.exports.BYTECODE_BYTES_ELEMENT = 7;
module.exports.BYTECODE_EMPTY = '0x0000000000000000000000000000000000000000000000000000000000000000';
module.exports.HASH_POSEIDON_ALL_ZEROES = '0xc71603f33a1144ca7953db0ab48808f4c4055e3364a246c33c18a9786cb0b359';
module.exports.ZERO_ROOT = [0n, 0n, 0n, 0n];
// EVM constant
module.exports.ADDRESS_BRIDGE = '0x9D98DeAbC42dd696Deb9e40b4f1CAB7dDBF55988';
module.exports.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2 = '0xa40D5f56745a118D0906a34E69aeC8C0Db1cB8fA';
module.exports.GLOBAL_EXIT_ROOT_STORAGE_POS = 0;
module.exports.LOCAL_EXIT_ROOT_STORAGE_POS = 1;
module.exports.BATCH_GAS_LIMIT = 30000000;
module.exports.BATCH_DIFFICULTY = 0;
module.exports.ADDRESS_SYSTEM = '0x000000000000000000000000000000005ca1ab1e';
module.exports.LAST_BLOCK_STORAGE_POS = 0;
module.exports.STATE_ROOT_STORAGE_POS = 1;
module.exports.TIMESTAMP_STORAGE_POS = 2; // Could be a mapping
module.exports.BLOCK_STORAGE_POS = 3; // Could be a mapping
module.exports.RECEIPT_STORAGE_POS = 4;

// Bridge Leaf Types
module.exports.BRIDGE_LEAF_TYPE_ASSET = 0;
module.exports.BRIDGE_LEAF_TYPE_MESSAGE = 1;
