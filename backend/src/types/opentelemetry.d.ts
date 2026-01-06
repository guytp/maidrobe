/**
 * OpenTelemetry Type Declarations
 * Simulated implementation - types only for compilation
 */

// Core API
declare module '@opentelemetry/api' {
  export interface TracerProvider {}
  export interface Tracer {}
  export interface Span {}
  export interface SpanContext {}

  export interface Context {}

  export interface MetricRecord {}
  export interface MetricReader {}
  export interface MetricExporter {}

  export class SpanStatusCode {
    static readonly UNSET: 0;
    static readonly OK: 1;
    static readonly ERROR: 2;
  }

  export enum ValueType {
    INT = 0,
    DOUBLE = 1,
  }

  export function context(): Context;
  export function getSpan(context: Context): Span | undefined;
  export function setSpan(context: Context, span: Span): Context;
  export function setSpanContext(context: Context, spanContext: SpanContext): Context;
  export function getSpanContext(context: Context): SpanContext | undefined;
  export function setGlobalTracerProvider(tracerProvider: TracerProvider): void;
  export function getGlobalTracerProvider(): TracerProvider;
}
