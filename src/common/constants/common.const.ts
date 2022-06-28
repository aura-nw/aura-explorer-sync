/**
 * PROCESSOR_CONSTANTS
 */
export const PROCESSOR_CONSTANTS = {
    SYNC_BLOCK: "SYNC_BLOCK_PROCESSOR",
    SYNC_MISSED_BLOCK: "SYNC_MISSED_BLOCK_PROCESSOR",
    BLOCK_SYNC_ERROR: "BLOCK_SYNC_ERROR_PROCESSOR",
    SYNC_VALIDATOR: "SYNC_VALIDATOR",
    SYNC_PROPOSAL: "SYNC_PROPOSAL",
};

/**
 * PROCESS_CONSTANTS
 */
export const PROCESS_CONSTANTS = {
    EXECUTE_SYNC_BLOCK: "executeSyncBlock",
    EXECUTE_SYNC_BLOCK_ERROR: "executeSyncBlockError",
    EXECUTE_SYNC_MISSED_BLOCK: "executeSyncMissedBlock",
    EXECUTE_SYNC_VALIDATOR: "executeSyncValidaror",
    EXECUTE_SYNC_PROPOSAL: "executeSyncProposal"
};

/**
 * BLOCK_SYNC_ERROR_STATUS
 */
export const BLOCK_SYNC_ERROR_STATUS_CONSTANTS = {
    ERROR: 'ERROR',
    PENDING: 'PENDING',
    RETRY: 'RETRY'
}

/**
 * JOB_PREFIX_CONSTANTS
 */
export const JOB_PREFIX_CONSTANTS = {
    SYNC_BLOCK: 'sync_block',
    SYNC_MISSED_BLOCK: 'sync_missed_block',
    BLOCK_SYNC_ERROR: 'block_sync_error',
    SYNC_VALIDOTOR: 'sync_validator',
    SYNC_PROPOSAL: 'sync_proposal'
}


/**
 * JOB_STATE_CONSTANTS
 */
export const JOB_STATE_CONSTANTS = {
    FAILED: 'failed',
    STUCK: 'stuck',
    PAUSED: 'paused'
}
