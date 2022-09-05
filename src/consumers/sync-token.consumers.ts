import { Processor } from "@nestjs/bull";
import { createClient } from "redis";
import { ENV_CONFIG } from "../shared/services/config.service";

export class SyncTokenConsumers{
}