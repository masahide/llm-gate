import { assistantProfileTool } from "../tools/assistant-profile.js";
import { currentTimeTool } from "../tools/current-time.js";
import {
  sevenDtdExecCommandTool,
  sevenDtdGetLogsTool,
  sevenDtdGetStatusTool,
  sevenDtdGetSummaryTool,
  sevenDtdRestartTool,
  sevenDtdStartTool,
  sevenDtdStopTool,
} from "../tools/seven-dtd-ops.js";
import { webResearchDigestTool } from "../tools/web-research-digest.js";

export function baseTools(): unknown[] {
  return [currentTimeTool, webResearchDigestTool, assistantProfileTool];
}

export function sevenDtdReadOnlyTools(): unknown[] {
  return [sevenDtdGetStatusTool, sevenDtdGetSummaryTool, sevenDtdGetLogsTool];
}

export function sevenDtdWriteTools(): unknown[] {
  return [sevenDtdStartTool, sevenDtdStopTool, sevenDtdRestartTool, sevenDtdExecCommandTool];
}

export function toolsForContext(options: {
  allowSevenDtd: boolean;
  enableWriteTools: boolean;
}): unknown[] {
  const tools = [...baseTools()];
  if (!options.allowSevenDtd) return tools;
  tools.push(...sevenDtdReadOnlyTools());
  if (options.enableWriteTools) tools.push(...sevenDtdWriteTools());
  return tools;
}
