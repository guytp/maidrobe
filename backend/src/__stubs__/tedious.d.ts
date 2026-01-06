/**
 * Stub module for tedious driver
 * This allows TypeScript compilation without installing the actual package
 */

declare module 'tedious' {
  export interface ConnectionConfig {
    server?: string;
    authentication?: {
      type:
        | 'default'
        | 'ntlm'
        | 'azure-active-directory-password'
        | 'azure-active-directory-access-token'
        | 'azure-active-directory-msi-vm'
        | 'azure-active-directory-msi-app-service'
        | 'azure-active-directory-service-principal-secret';
      options: {
        userName?: string;
        password?: string;
        [key: string]: any;
      };
    };
    options?: {
      port?: number;
      database?: string;
      encrypt?: boolean;
      trustServerCertificate?: boolean;
      columnEncryptionSetting?: boolean;
      useColumnNames?: boolean;
      camelCaseColumns?: boolean;
      connectionTimeout?: number;
      requestTimeout?: number;
      rowCollectionOnDone?: boolean;
      rowCollectionOnRequestCompletion?: boolean;
      [key: string]: any;
    };
  }
}
