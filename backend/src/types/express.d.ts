// Express type declarations for middleware
declare module 'express' {
  export interface Request {
    headers: { [key: string]: string };
    body: any;
    path: string;
    method: string;
    query: { [key: string]: string };
    ip: string;
  }

  export interface Response {
    status(code: number): Response;
    json(data: any): Response;
  }

  export interface NextFunction {
    (err?: any): void;
  }

  export function Router(): any;
}
