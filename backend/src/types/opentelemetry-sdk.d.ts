/**
 * OpenTelemetry SDK Type Declarations
 */

declare module '@opentelemetry/sdk-trace-node' {
  import { TracerProvider, Tracer } from '@opentelemetry/api';
  import { Resource } from '@opentelemetry/resources';
  import { SpanProcessor, IdGenerator } from '@opentelemetry/sdk-trace-base';

  export interface NodeTracerProviderConfig {
    resource?: Resource;
    spanProcessors?: SpanProcessor[];
    idGenerator?: IdGenerator;
  }

  export class NodeTracerProvider implements TracerProvider {
    constructor(config?: NodeTracerProviderConfig);
  }
}

declare module '@opentelemetry/sdk-trace-base' {
  import { SpanProcessor, SpanExporter, TracerProvider } from '@opentelemetry/api';

  export abstract class SpanProcessor {}

  export interface IdGenerator {
    generateSpanId(): string;
    generateTraceId(): string;
  }

  export interface BatchSpanProcessorConfig {
    maxQueueSize?: number;
    maxExportBatchSize?: number;
    scheduledDelayMillis?: number;
  }

  export class BatchSpanProcessor implements SpanProcessor {
    constructor(exporter: SpanExporter, config?: BatchSpanProcessorConfig);
  }

  export abstract class SpanExporter {}
}

declare module '@opentelemetry/id-generator-aws-xray' {
  import { IdGenerator } from '@opentelemetry/sdk-trace-base';

  export class AWSXRayIdGenerator implements IdGenerator {
    generateSpanId(): string;
    generateTraceId(): string;
  }
}

declare module '@opentelemetry/propagator-aws-xray' {
  export class AWSXRayPropagator {}
}

declare module '@opentelemetry/resources' {
  export interface ResourceAttributes {
    [key: string]: string | number | boolean;
  }

  export class Resource {
    constructor(attributes?: ResourceAttributes);
    merge(other: Resource): Resource;
  }
}

declare module '@opentelemetry/exporter-aws-xray' {
  import { SpanExporter } from '@opentelemetry/sdk-trace-base';
  import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';
  import { Resource } from '@opentelemetry/resources';

  export interface AWSXRaySpanExporterConfig {
    resource?: Resource;
    region?: string;
  }

  export class AWSXRaySpanExporter extends SpanExporter {
    constructor(config?: AWSXRaySpanExporterConfig);
  }
}
