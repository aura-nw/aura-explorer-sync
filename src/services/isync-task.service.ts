export interface ISyncTaskService {
    handleSyncData(height: number, recall: boolean): Promise<any>;

    syncMissedBlock(height: number): Promise<any>;

    syncValidator(validators: Array<any>): Promise<any>;
}