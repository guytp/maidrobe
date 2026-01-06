/**
 * Type declarations for modules without @types packages
 */

declare module 'uuid' {
  export function v4(): string;
  export function v4(options: any, buffer: any, offset: any): any;
}

declare module 'aws-sdk' {
  // CloudWatch Logs
  export interface CloudWatchLogsConfig {
    region?: string;
    apiVersion?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }

  export interface PutLogEventsRequest {
    logGroupName: string;
    logStreamName: string;
    logEvents: Array<{
      timestamp: number;
      message: string;
    }>;
    sequenceToken?: string;
  }

  export interface PutLogEventsResponse {
    nextSequenceToken?: string;
    rejectedLogEventsInfo?: any;
  }

  export class CloudWatchLogs {
    constructor(config?: CloudWatchLogsConfig);
    putLogEvents(
      params: PutLogEventsRequest,
      callback?: (err: any, data: PutLogEventsResponse) => void
    ): any;
    putLogEvents(params: PutLogEventsRequest): Promise<PutLogEventsResponse>;
  }

  // KMS
  export interface KMSConfig {
    region?: string;
    apiVersion?: string;
  }

  export interface ScheduleKeyRotationRequest {
    KeyId: string;
  }

  export interface DisableKeyRequest {
    KeyId: string;
  }

  export interface ScheduleKeyDeletionRequest {
    KeyId: string;
    PendingWindowInDays: number;
  }

  export interface GetKeyRotationStatusRequest {
    KeyId: string;
  }

  export interface GetKeyRotationStatusResponse {
    KeyRotationEnabled: boolean;
  }

  export interface DescribeKeyRequest {
    KeyId: string;
  }

  export interface DescribeKeyResponse {
    KeyMetadata: {
      KeyId: string;
      Arn: string;
      KeyState: string;
    };
  }

  export class KMS {
    constructor(config?: KMSConfig);
    scheduleKeyRotation(
      params: ScheduleKeyRotationRequest,
      callback?: (err: any, data: any) => void
    ): any;
    scheduleKeyRotation(params: ScheduleKeyRotationRequest): Promise<any>;

    disableKey(params: DisableKeyRequest, callback?: (err: any, data: any) => void): any;
    disableKey(params: DisableKeyRequest): Promise<any>;

    scheduleKeyDeletion(
      params: ScheduleKeyDeletionRequest,
      callback?: (err: any, data: any) => void
    ): any;
    scheduleKeyDeletion(params: ScheduleKeyDeletionRequest): Promise<any>;

    getKeyRotationStatus(
      params: GetKeyRotationStatusRequest,
      callback?: (err: any, data: GetKeyRotationStatusResponse) => void
    ): any;
    getKeyRotationStatus(
      params: GetKeyRotationStatusRequest
    ): Promise<GetKeyRotationStatusResponse>;

    describeKey(
      params: DescribeKeyRequest,
      callback?: (err: any, data: DescribeKeyResponse) => void
    ): any;
    describeKey(params: DescribeKeyRequest): Promise<DescribeKeyResponse>;
  }
}

declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number;
    notBefore?: string | number;
    audience?: string;
    issuer?: string;
    jwtid?: string;
    subject?: string;
    noTimestamp?: boolean;
    header?: any;
  }

  export interface VerifyOptions {
    algorithms?: string[];
    audience?: string | string[];
    clockTimestamp?: number;
    clockTolerance?: number;
    issuer?: string | string[];
    ignoreExpiration?: boolean;
    ignoreNotBefore?: boolean;
    subject?: string;
  }

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string,
    options?: SignOptions
  ): string;
  export function verify(
    token: string,
    secretOrPublicKey: string,
    options?: VerifyOptions
  ): object | string;
  export function decode(token: string, options?: { complete?: boolean; json?: boolean }): any;
}

declare module 'bcrypt' {
  export function hash(data: string, saltOrRounds: string | number): Promise<string>;
  export function hashSync(data: string, saltOrRounds: string | number): string;
  export function compare(data: string, encrypted: string): Promise<boolean>;
  export function compareSync(data: string, encrypted: string): boolean;
  export function genSalt(rounds?: number): Promise<string>;
  export function genSaltSync(rounds?: number): string;
}
