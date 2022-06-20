export interface ISyncTaskService {
    handleSyncData(syncBlock: number, recallSync: boolean): Promise<any>;
}