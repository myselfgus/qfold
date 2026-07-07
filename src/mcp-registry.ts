/**
 * MCP Tool Registry for approved external tool calls
 */

export async function validateMCPToolCall(request: Request, kv: KVNamespace): Promise<boolean> {
  const body = await request.clone().json().catch(() => ({})) as any;
  const toolName = body?.tool || body?.name;
  
  if (!toolName) return false;
  
  const approved = await kv.get(`mcp:approved:${toolName}`);
  return approved === 'true';
}

export interface MCPToolRegistry {
  registerApprovedTool(tool: string): Promise<void>;
}
