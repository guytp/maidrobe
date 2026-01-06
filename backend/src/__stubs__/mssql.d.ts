/**
 * Stub module for mssql driver
 * This allows TypeScript compilation without installing the actual package
 */

declare module 'mssql' {
  export interface config {
    server: string;
    database?: string;
    user?: string;
    password?: string;
    port?: number;
    options?: {
      encrypt?: boolean;
      trustServerCertificate?: boolean;
      [key: string]: any;
    };
    pool?: {
      min?: number;
      max?: number;
      idleTimeoutMillis?: number;
    };
  }

  export class ConnectionPool {
    constructor(config: config);
    connect(): Promise<ConnectionPool>;
    close(): Promise<void>;
    request(): Request;
    connected: boolean;
  }

  export class Request {
    input(name: string, type: any, value: any): Request;
    query<T = any>(sql: string): Promise<{ recordset: T[]; rowsAffected: number[] }>;
    execute<T = any>(procedure: string): Promise<{ recordset: T[]; rowsAffected: number[] }>;
    batch<T = any>(sql: string): Promise<{ recordset: T[]; rowsAffected: number[] }>;
  }

  export const TYPES: {
    NVarChar: any;
    Int: any;
    UniqueIdentifier: any;
    DateTime: any;
    DateTime2: any;
    Bit: any;
    Money: any;
    Decimal: any;
    VarBinary: any;
    [key: string]: any;
  };

  export const MAX: number;
}
