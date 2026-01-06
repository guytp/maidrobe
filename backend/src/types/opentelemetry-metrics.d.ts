/**
 * OpenTelemetry Metrics & Semantic Conventions Type Declarations
 */

declare module '@opentelemetry/semantic-conventions' {
  export const SemanticResourceAttributes: {
    SERVICE_NAME: string;
    SERVICE_VERSION: string;
    DEPLOYMENT_ENVIRONMENT: string;
    // Add more as needed
  };
}

declare module '@opentelemetry/exporter-metrics-otlp-grpc' {
  import { MetricExporter } from '@opentelemetry/sdk-metrics';

  export interface OTLPMetricExporterConfig {
    url?: string;
    credentials?: any;
    metadata?: any;
    concurrencyLimit?: number;
  }

  export class OTLPMetricExporter implements MetricExporter {
    constructor(config?: OTLPMetricExporterConfig);
  }
}

declare module '@opentelemetry/sdk-metrics' {
  import { MetricReader, MetricExporter, Resource } from '@opentelemetry/api';

  export interface PeriodicExportingMetricReaderConfig {
    exporter: MetricExporter;
    exportIntervalMillis?: number;
  }

  export class PeriodicExportingMetricReader extends MetricReader {
    constructor(config: PeriodicExportingMetricReaderConfig);
  }

  export interface MeterProviderConfig {
    resource?: Resource;
    readers?: MetricReader[];
  }

  export class MeterProvider {
    constructor(config?: MeterProviderConfig);
  }

  export interface HistogramMetric {
    record(value: number, attributes?: any): void;
  }

  export interface ObservableGaugeMetric {
    addCallback(callback: (observableResult: any) => void): void;
  }

  export interface ObservableResult {
    observe(value: number, attributes?: any): void;
  }

  export interface MetricOptions {
    description?: string;
    unit?: string;
    valueType?: any;
  }

  export interface Meter {
    createHistogram(name: string, options?: MetricOptions): HistogramMetric;
    createObservableGauge(name: string, options?: MetricOptions): ObservableGaugeMetric;
  }
}