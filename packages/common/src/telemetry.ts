import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

export interface TraceContext {
  traceId: string;
  spanId: string;
  correlationId: string;
}

export const generateCorrelationId = (): string => uuidv4();

export const createSpan = (name: string, options?: { kind?: SpanKind }) => {
  const tracer = trace.getTracer('smile-interop');
  return tracer.startSpan(name, {
    kind: options?.kind ?? SpanKind.INTERNAL,
  });
};

export const withSpan = async <T>(
  name: string,
  fn: () => Promise<T>,
  options?: { kind?: SpanKind }
): Promise<T> => {
  const span = createSpan(name, options);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
};

export const getCurrentTraceContext = (): TraceContext | null => {
  const span = trace.getActiveSpan();
  if (!span) {
    return null;
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    correlationId: generateCorrelationId(),
  };
};