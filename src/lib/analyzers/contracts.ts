import type { EvidenceItem, ResourceType, SandboxResult, ThreatIntelligenceStatus } from "../scan";

export interface AnalysisContext { url: URL; resourceType: ResourceType }
export interface AnalyzerResult { evidence: EvidenceItem[]; warnings: string[] }
export interface StaticAnalyzer { analyze(context: AnalysisContext): Promise<AnalyzerResult> }
export interface ContentAnalyzer { analyze(context: AnalysisContext): Promise<AnalyzerResult> }
export interface MLAnalyzer { analyze(context: AnalysisContext): Promise<{ available: boolean; probability?: number; warning?: string }> }
export interface ThreatIntelligence { provider: string; check(url: URL): Promise<ThreatIntelligenceStatus & { category?: string; confidence?: number | null }> }
export interface SandboxAnalyzer { analyze(context: AnalysisContext): Promise<SandboxResult> }
