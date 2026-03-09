import path from "node:path";
import type { ClaudeHookData } from "../utils/claude";
import type { PowerlineColors } from "../themes";
import type { PowerlineConfig } from "../config/loader";
import type { BlockInfo } from "./block";
import { formatModelName } from "../utils/formatters";

export interface SegmentConfig {
  enabled: boolean;
  label?: string;
}

export interface DirectorySegmentConfig extends SegmentConfig {
  showBasename?: boolean;
  style?: "full" | "fish" | "basename";
}

export interface GitSegmentConfig extends SegmentConfig {
  showSha?: boolean;
  showAheadBehind?: boolean;
  showWorkingTree?: boolean;
  showOperation?: boolean;
  showTag?: boolean;
  showTimeSinceCommit?: boolean;
  showStashCount?: boolean;
  showUpstream?: boolean;
  showRepoName?: boolean;
}

export interface UsageSegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "breakdown";
  costSource?: "calculated" | "official";
}

export interface TmuxSegmentConfig extends SegmentConfig {}

export interface ContextSegmentConfig extends SegmentConfig {
  showPercentageOnly?: boolean;
  displayStyle?: "text" | "ball" | "bar" | "blocks" | "blocks-line" | "capped" | "dots" | "filled" | "geometric" | "line" | "squares";
  showCompactEstimate?: boolean;
}

export interface MetricsSegmentConfig extends SegmentConfig {
  showResponseTime?: boolean;
  showLastResponseTime?: boolean;
  showDuration?: boolean;
  showMessageCount?: boolean;
  showLinesAdded?: boolean;
  showLinesRemoved?: boolean;
  showModelBreakdown?: boolean;
}

export interface BlockSegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "time" | "weighted";
  burnType?: "cost" | "tokens" | "both" | "none";
  showBar?: boolean;
  barLength?: number;
}

export interface TodaySegmentConfig extends SegmentConfig {
  type: "cost" | "tokens" | "both" | "breakdown";
}

export interface VersionSegmentConfig extends SegmentConfig {}

export interface EnvSegmentConfig extends SegmentConfig {
  variable: string;
  prefix?: string;
}

export type AnySegmentConfig =
  | SegmentConfig
  | DirectorySegmentConfig
  | GitSegmentConfig
  | UsageSegmentConfig
  | TmuxSegmentConfig
  | ContextSegmentConfig
  | MetricsSegmentConfig
  | BlockSegmentConfig
  | TodaySegmentConfig
  | VersionSegmentConfig
  | EnvSegmentConfig;

import {
  formatCost,
  formatTokens,
  formatTokenBreakdown,
  formatTimeSince,
  formatDuration,
} from "../utils/formatters";
import { getBudgetStatus } from "../utils/budget";
import type {
  UsageInfo,
  TokenBreakdown,
  GitInfo,
  ContextInfo,
  MetricsInfo,
} from ".";
import type { TodayInfo } from "./today";

export interface PowerlineSymbols {
  right: string;
  left: string;
  branch: string;
  model: string;
  git_clean: string;
  git_dirty: string;
  git_conflicts: string;
  git_ahead: string;
  git_behind: string;
  git_worktree: string;
  git_tag: string;
  git_sha: string;
  git_upstream: string;
  git_stash: string;
  git_time: string;
  session_cost: string;
  block_cost: string;
  today_cost: string;
  context_time: string;
  metrics_response: string;
  metrics_last_response: string;
  metrics_duration: string;
  metrics_messages: string;
  metrics_lines_added: string;
  metrics_lines_removed: string;
  metrics_burn: string;
  version: string;
  bar_filled: string;
  bar_empty: string;
  env: string;
}

export interface SegmentData {
  text: string;
  bgColor: string;
  fgColor: string;
}

interface BarStyleDef {
  filled: string;
  empty: string;
  cap?: string;
  marker?: string;
}

const BAR_STYLES: Record<string, BarStyleDef> = {
  ball:          { filled: "─", empty: "─", marker: "●" },
  blocks:        { filled: "█", empty: "░" },
  "blocks-line": { filled: "█", empty: "─" },
  capped:        { filled: "━", empty: "┄", cap: "╸" },
  dots:          { filled: "●", empty: "○" },
  filled:        { filled: "■", empty: "□" },
  geometric:     { filled: "▰", empty: "▱" },
  line:          { filled: "━", empty: "┄" },
  squares:       { filled: "◼", empty: "◻" },
};

function applyLabel(text: string, label?: string): string {
  return label ? `${label} ${text}` : text;
}

function symPrefix(sym: string, text: string): string {
  return sym ? `${sym} ${text}` : text;
}

export class SegmentRenderer {
  constructor(
    private readonly config: PowerlineConfig,
    private readonly symbols: PowerlineSymbols,
  ) {}

  renderDirectory(
    hookData: ClaudeHookData,
    colors: PowerlineColors,
    config?: DirectorySegmentConfig,
  ): SegmentData {
    const currentDir = hookData.workspace?.current_dir || hookData.cwd || "/";
    const projectDir = hookData.workspace?.project_dir;

    const style = config?.style ?? (config?.showBasename ? "basename" : "full");

    if (style === "basename") {
      const basename = path.basename(currentDir) || "root";
      return {
        text: applyLabel(basename, config?.label),
        bgColor: colors.modeBg,
        fgColor: colors.modeFg,
      };
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE;
    let displayDir = currentDir;
    let displayProjectDir = projectDir;

    if (homeDir) {
      if (currentDir.startsWith(homeDir)) {
        displayDir = currentDir.replace(homeDir, "~");
      }
      if (projectDir && projectDir.startsWith(homeDir)) {
        displayProjectDir = projectDir.replace(homeDir, "~");
      }
    }

    let dirName = this.getDisplayDirectoryName(displayDir, displayProjectDir);

    if (style === "fish") {
      dirName = this.abbreviateFishStyle(dirName);
    }

    return {
      text: applyLabel(dirName, config?.label),
      bgColor: colors.modeBg,
      fgColor: colors.modeFg,
    };
  }

  renderGit(
    gitInfo: GitInfo,
    colors: PowerlineColors,
    config?: GitSegmentConfig,
  ): SegmentData | null {
    if (!gitInfo) return null;

    const parts: string[] = [];

    if (config?.showRepoName && gitInfo.repoName) {
      parts.push(gitInfo.repoName);
      if (gitInfo.isWorktree) {
        parts.push(this.symbols.git_worktree);
      }
    }

    if (config?.showOperation && gitInfo.operation) {
      parts.push(`[${gitInfo.operation}]`);
    }

    parts.push(`${this.symbols.branch} ${gitInfo.branch}`);

    if (config?.showTag && gitInfo.tag) {
      parts.push(`${this.symbols.git_tag} ${gitInfo.tag}`);
    }

    if (config?.showSha && gitInfo.sha) {
      parts.push(`${this.symbols.git_sha} ${gitInfo.sha}`);
    }

    if (config?.showAheadBehind !== false) {
      if (gitInfo.ahead > 0 && gitInfo.behind > 0) {
        parts.push(
          `${this.symbols.git_ahead}${gitInfo.ahead}${this.symbols.git_behind}${gitInfo.behind}`,
        );
      } else if (gitInfo.ahead > 0) {
        parts.push(`${this.symbols.git_ahead}${gitInfo.ahead}`);
      } else if (gitInfo.behind > 0) {
        parts.push(`${this.symbols.git_behind}${gitInfo.behind}`);
      }
    }

    if (config?.showWorkingTree) {
      const counts: string[] = [];
      if (gitInfo.staged && gitInfo.staged > 0)
        counts.push(`+${gitInfo.staged}`);
      if (gitInfo.unstaged && gitInfo.unstaged > 0)
        counts.push(`~${gitInfo.unstaged}`);
      if (gitInfo.untracked && gitInfo.untracked > 0)
        counts.push(`?${gitInfo.untracked}`);
      if (gitInfo.conflicts && gitInfo.conflicts > 0)
        counts.push(`!${gitInfo.conflicts}`);
      if (counts.length > 0) {
        parts.push(`(${counts.join(" ")})`);
      }
    }

    if (config?.showUpstream && gitInfo.upstream) {
      parts.push(`${this.symbols.git_upstream}${gitInfo.upstream}`);
    }

    if (
      config?.showStashCount &&
      gitInfo.stashCount &&
      gitInfo.stashCount > 0
    ) {
      parts.push(`${this.symbols.git_stash} ${gitInfo.stashCount}`);
    }

    if (config?.showTimeSinceCommit && gitInfo.timeSinceCommit !== undefined) {
      const time = formatTimeSince(gitInfo.timeSinceCommit);
      parts.push(`${this.symbols.git_time} ${time}`);
    }

    let gitStatusIcon = this.symbols.git_clean;
    if (gitInfo.status === "conflicts") {
      gitStatusIcon = this.symbols.git_conflicts;
    } else if (gitInfo.status === "dirty") {
      gitStatusIcon = this.symbols.git_dirty;
    }
    parts.push(gitStatusIcon);

    return {
      text: applyLabel(parts.join(" "), config?.label),
      bgColor: colors.gitBg,
      fgColor: colors.gitFg,
    };
  }

  renderModel(hookData: ClaudeHookData, colors: PowerlineColors, config?: SegmentConfig): SegmentData {
    const rawName = hookData.model?.display_name || "Claude";
    const modelName = formatModelName(rawName);

    return {
      text: applyLabel(symPrefix(this.symbols.model, modelName), config?.label),
      bgColor: colors.modelBg,
      fgColor: colors.modelFg,
    };
  }

  renderSession(
    usageInfo: UsageInfo,
    colors: PowerlineColors,
    config?: UsageSegmentConfig,
  ): SegmentData {
    const type = config?.type || "cost";
    const costSource = config?.costSource;
    const sessionBudget = this.config.budget?.session;

    const getCost = () => {
      if (costSource === "calculated") return usageInfo.session.calculatedCost;
      if (costSource === "official") return usageInfo.session.officialCost;
      return usageInfo.session.cost;
    };

    const formattedUsage = this.formatUsageWithBudget(
      getCost(),
      usageInfo.session.tokens,
      usageInfo.session.tokenBreakdown,
      type,
      sessionBudget?.amount,
      sessionBudget?.warningThreshold || 80,
      sessionBudget?.type,
    );

    const text = applyLabel(symPrefix(this.symbols.session_cost, formattedUsage), config?.label);

    return {
      text,
      bgColor: colors.sessionBg,
      fgColor: colors.sessionFg,
    };
  }

  renderTmux(
    sessionId: string | null,
    colors: PowerlineColors,
  ): SegmentData | null {
    if (!sessionId) {
      return {
        text: `tmux:none`,
        bgColor: colors.tmuxBg,
        fgColor: colors.tmuxFg,
      };
    }

    return {
      text: `tmux:${sessionId}`,
      bgColor: colors.tmuxBg,
      fgColor: colors.tmuxFg,
    };
  }

  renderContext(
    contextInfo: ContextInfo | null,
    colors: PowerlineColors,
    config?: ContextSegmentConfig,
    messageCount?: number | null,
  ): SegmentData | null {
    const barLength = 10;
    const style = config?.displayStyle ?? "text";

    const barStyleDef = style === "bar"
      ? { filled: this.symbols.bar_filled, empty: this.symbols.bar_empty } as BarStyleDef
      : BAR_STYLES[style] ?? null;

    if (!contextInfo) {
      if (barStyleDef) {
        const emptyBar = barStyleDef.empty.repeat(barLength);
        return {
          text: applyLabel(`${emptyBar} 0%`, config?.label),
          bgColor: colors.contextBg,
          fgColor: colors.contextFg,
        };
      }
      return {
        text: applyLabel(symPrefix(this.symbols.context_time, "0 used · 100% free"), config?.label),
        bgColor: colors.contextBg,
        fgColor: colors.contextFg,
      };
    }

    let bgColor = colors.contextBg;
    let fgColor = colors.contextFg;

    if (contextInfo.contextLeftPercentage <= 20) {
      bgColor = colors.contextCriticalBg;
      fgColor = colors.contextCriticalFg;
    } else if (contextInfo.contextLeftPercentage <= 40) {
      bgColor = colors.contextWarningBg;
      fgColor = colors.contextWarningFg;
    }

    if (barStyleDef) {
      const usedPct = contextInfo.usablePercentage;
      const filledCount = Math.round((usedPct / 100) * barLength);
      const emptyCount = barLength - filledCount;
      const bar = this.buildBar(barStyleDef, filledCount, emptyCount, barLength);

      const rawText = config?.showPercentageOnly
        ? `${bar} ${usedPct}%`
        : `${bar} ${contextInfo.totalTokens.toLocaleString()} (${usedPct}%)`;

      return { text: applyLabel(rawText, config?.label), bgColor, fgColor };
    }

    const contextLeft = `${contextInfo.contextLeftPercentage}%`;

    let compactNote = "";
    if (config?.showCompactEstimate) {
      const tokensLeft = contextInfo.usableTokens - contextInfo.totalTokens;
      if (tokensLeft <= 0) {
        compactNote = " · compact due";
      } else if (messageCount && messageCount > 0 && contextInfo.totalTokens > 0) {
        const tokensPerMsg = contextInfo.totalTokens / messageCount;
        const msgsLeft = Math.round(tokensLeft / tokensPerMsg);
        compactNote = ` · ~${msgsLeft} msgs to compact`;
      }
    }

    const rawText = config?.showPercentageOnly
      ? symPrefix(this.symbols.context_time, `${contextLeft} free${compactNote}`)
      : symPrefix(this.symbols.context_time, `${contextInfo.totalTokens.toLocaleString()} used · ${contextLeft} free${compactNote}`);

    return { text: applyLabel(rawText, config?.label), bgColor, fgColor };
  }

  private buildBar(s: BarStyleDef, filledCount: number, emptyCount: number, barLength: number): string {
    if (s.marker) {
      const pos = Math.min(filledCount, barLength - 1);
      return s.filled.repeat(pos) + s.marker + s.empty.repeat(barLength - pos - 1);
    }
    if (s.cap) {
      if (filledCount === 0) {
        return s.cap + s.empty.repeat(barLength - 1);
      }
      if (filledCount >= barLength) {
        return s.filled.repeat(barLength);
      }
      return s.filled.repeat(filledCount - 1) + s.cap + s.empty.repeat(emptyCount);
    }
    return s.filled.repeat(filledCount) + s.empty.repeat(emptyCount);
  }

  renderMetrics(
    metricsInfo: MetricsInfo | null,
    colors: PowerlineColors,
    _blockInfo: BlockInfo | null,
    config?: MetricsSegmentConfig,
  ): SegmentData | null {
    if (!metricsInfo) {
      return {
        text: applyLabel(`${this.symbols.metrics_response} new`, (config as SegmentConfig | undefined)?.label),
        bgColor: colors.metricsBg,
        fgColor: colors.metricsFg,
      };
    }

    const parts: string[] = [];

    if (config?.showLastResponseTime && metricsInfo.lastResponseTime !== null) {
      const lastResponseTime =
        metricsInfo.lastResponseTime < 60
          ? `${metricsInfo.lastResponseTime.toFixed(1)}s`
          : `${(metricsInfo.lastResponseTime / 60).toFixed(1)}m`;
      parts.push(`last: ${lastResponseTime}`);
    }

    if (
      config?.showResponseTime !== false &&
      metricsInfo.responseTime !== null
    ) {
      const responseTime =
        metricsInfo.responseTime < 60
          ? `${metricsInfo.responseTime.toFixed(1)}s`
          : `${(metricsInfo.responseTime / 60).toFixed(1)}m`;
      parts.push(`${this.symbols.metrics_response} api: ${responseTime}`);
    }

    if (
      config?.showDuration !== false &&
      metricsInfo.sessionDuration !== null
    ) {
      const duration = formatDuration(metricsInfo.sessionDuration);
      parts.push(`elapsed: ${duration}`);
    }

    if (
      config?.showMessageCount !== false &&
      metricsInfo.messageCount !== null
    ) {
      parts.push(`${metricsInfo.messageCount} msgs`);
    }

    const linesAdded = config?.showLinesAdded !== false && metricsInfo.linesAdded !== null && metricsInfo.linesAdded > 0
      ? metricsInfo.linesAdded : null;
    const linesRemoved = config?.showLinesRemoved !== false && metricsInfo.linesRemoved !== null && metricsInfo.linesRemoved > 0
      ? metricsInfo.linesRemoved : null;
    if (linesAdded !== null || linesRemoved !== null) {
      const linesParts: string[] = [];
      if (linesAdded !== null) linesParts.push(`+${linesAdded}`);
      if (linesRemoved !== null) linesParts.push(`−${linesRemoved}`);
      parts.push(`${linesParts.join(" ")} lines`);
    }

    if (config?.showModelBreakdown && _blockInfo && Object.keys(_blockInfo.modelBreakdown).length > 0) {
      const breakdown = _blockInfo.modelBreakdown;
      const modelOrder = ["opus", "sonnet", "haiku", "other"];
      const breakdownParts: string[] = [];
      for (const family of modelOrder) {
        if (breakdown[family] && breakdown[family] > 0) {
          const label = family === "opus" ? "Opus" : family === "sonnet" ? "Sonnet" : family === "haiku" ? "Haiku" : "Other";
          breakdownParts.push(`${label} ${formatTokens(breakdown[family]).replace(" tokens", "")}`);
        }
      }
      if (breakdownParts.length > 0) {
        parts.push(`tokens: ${breakdownParts.join(" · ")}`);
      }
    }

    const metricsLabel = (config as SegmentConfig | undefined)?.label;

    if (parts.length === 0) {
      return {
        text: applyLabel(`${this.symbols.metrics_response} active`, metricsLabel),
        bgColor: colors.metricsBg,
        fgColor: colors.metricsFg,
      };
    }

    return {
      text: applyLabel(parts.join(" "), metricsLabel),
      bgColor: colors.metricsBg,
      fgColor: colors.metricsFg,
    };
  }

  renderBlock(
    blockInfo: BlockInfo,
    colors: PowerlineColors,
    config?: BlockSegmentConfig,
  ): SegmentData {
    let displayText: string;

    if (blockInfo.cost === null && blockInfo.tokens === null) {
      displayText = "No active block";
    } else {
      const type = config?.type || "cost";
      const burnType = config?.burnType;
      const blockBudget = this.config.budget?.block;

      const timeStr =
        blockInfo.timeRemaining !== null
          ? (() => {
              const hours = Math.floor(blockInfo.timeRemaining / 60);
              const minutes = blockInfo.timeRemaining % 60;
              return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            })()
          : null;

      let mainContent: string;
      switch (type) {
        case "cost":
          mainContent = this.formatUsageWithBudget(
            blockInfo.cost,
            null,
            null,
            "cost",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
          break;
        case "tokens":
          mainContent = this.formatUsageWithBudget(
            null,
            blockInfo.tokens,
            null,
            "tokens",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
          break;
        case "weighted":
          const rateLimit =
            blockBudget?.type === "tokens" ? blockBudget.amount : undefined;
          const weightedDisplay = formatTokens(blockInfo.weightedTokens);
          if (rateLimit && blockInfo.weightedTokens !== null) {
            const rateLimitStatus = getBudgetStatus(
              blockInfo.weightedTokens,
              rateLimit,
              blockBudget?.warningThreshold || 80,
            );
            const pctUsed = rateLimitStatus.percentage !== null
              ? `${rateLimitStatus.percentage.toFixed(0)}%`
              : null;
            const usedNum = weightedDisplay.replace(" tokens", "");
            mainContent = pctUsed
              ? `${usedNum} / ${formatTokens(rateLimit)} used (${pctUsed})`
              : `${weightedDisplay} used`;
          } else {
            mainContent = `${weightedDisplay} used (weighted)`;
          }
          break;
        case "both":
          mainContent = this.formatUsageWithBudget(
            blockInfo.cost,
            blockInfo.tokens,
            null,
            "both",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
          break;
        case "time":
          mainContent = timeStr || "N/A";
          break;
        default:
          mainContent = this.formatUsageWithBudget(
            blockInfo.cost,
            null,
            null,
            "cost",
            blockBudget?.amount,
            blockBudget?.warningThreshold,
            blockBudget?.type,
          );
      }

      let burnContent = "";
      if (burnType && burnType !== "none") {
        switch (burnType) {
          case "cost":
            const costBurnRate =
              blockInfo.burnRate !== null
                ? blockInfo.burnRate < 1
                  ? `${(blockInfo.burnRate * 100).toFixed(0)}¢/h`
                  : `$${blockInfo.burnRate.toFixed(2)}/h`
                : "N/A";
            burnContent = ` · burn: ${costBurnRate}`;
            break;
          case "tokens":
            const tokenBurnRate =
              blockInfo.tokenBurnRate !== null
                ? `${formatTokens(Math.round(blockInfo.tokenBurnRate))}/h`
                : "N/A";
            burnContent = ` · burn: ${tokenBurnRate}`;
            break;
          case "both":
            const costBurn =
              blockInfo.burnRate !== null
                ? blockInfo.burnRate < 1
                  ? `${(blockInfo.burnRate * 100).toFixed(0)}¢/h`
                  : `$${blockInfo.burnRate.toFixed(2)}/h`
                : "N/A";
            const tokenBurn =
              blockInfo.tokenBurnRate !== null
                ? `${formatTokens(Math.round(blockInfo.tokenBurnRate))}/h`
                : "N/A";
            burnContent = ` · burn: ${costBurn} / ${tokenBurn}`;
            break;
        }
      }

      if (type === "time") {
        displayText = mainContent;
      } else {
        displayText = timeStr
          ? `${mainContent}${burnContent} · resets in ${timeStr}`
          : `${mainContent}${burnContent}`;
      }
    }

    if (config?.showBar) {
      const blockBudget = this.config.budget?.block;
      const barLen = config.barLength ?? 12;
      let barText = "";

      if (blockBudget?.amount && blockBudget.amount > 0) {
        const used = blockBudget.type === "tokens"
          ? (blockInfo.weightedTokens ?? blockInfo.tokens ?? 0)
          : (blockInfo.cost ?? 0);
        const rawPct = Math.round((used / blockBudget.amount) * 100);
        const pct = Math.min(100, rawPct);
        const filled = rawPct >= 100 ? barLen : Math.round((rawPct / 100) * barLen);
        const bar = this.buildBar(
          { filled: this.symbols.bar_filled, empty: this.symbols.bar_empty },
          filled,
          barLen - filled,
          barLen,
        );
        const timeStr2 = blockInfo.timeRemaining !== null
          ? (() => {
              const h = Math.floor((blockInfo.timeRemaining) / 60);
              const m = blockInfo.timeRemaining % 60;
              return h > 0 ? `${h}h ${m}m` : `${m}m`;
            })()
          : null;
        barText = timeStr2
          ? `${bar} ${pct}% · resets ${timeStr2}`
          : `${bar} ${pct}%`;
      } else {
        barText = displayText;
      }

      return {
        text: applyLabel(barText, config?.label),
        bgColor: colors.blockBg,
        fgColor: colors.blockFg,
      };
    }

    return {
      text: applyLabel(symPrefix(this.symbols.block_cost, displayText), config?.label),
      bgColor: colors.blockBg,
      fgColor: colors.blockFg,
    };
  }

  renderToday(
    todayInfo: TodayInfo,
    colors: PowerlineColors,
    type = "cost",
    config?: TodaySegmentConfig,
  ): SegmentData {
    const todayBudget = this.config.budget?.today;
    const rawText = symPrefix(this.symbols.today_cost, this.formatUsageWithBudget(
      todayInfo.cost,
      todayInfo.tokens,
      todayInfo.tokenBreakdown,
      type,
      todayBudget?.amount,
      todayBudget?.warningThreshold,
      todayBudget?.type,
    ));

    return {
      text: applyLabel(rawText, config?.label),
      bgColor: colors.todayBg,
      fgColor: colors.todayFg,
    };
  }

  private getDisplayDirectoryName(
    currentDir: string,
    projectDir?: string,
  ): string {
    if (currentDir.startsWith("~")) {
      return currentDir;
    }

    if (projectDir && projectDir !== currentDir) {
      if (currentDir.startsWith(projectDir)) {
        const relativePath = currentDir.slice(projectDir.length + 1);
        return relativePath || path.basename(projectDir) || "project";
      }
      return path.basename(currentDir) || "root";
    }

    return path.basename(currentDir) || "root";
  }

  private abbreviateFishStyle(dirPath: string): string {
    const parts = dirPath.split(path.sep);
    return parts
      .map((part, index) => {
        if (index === parts.length - 1) return part;
        if (part === "~" || part === "") return part;
        return part.charAt(0);
      })
      .join(path.sep);
  }

  private formatUsageDisplay(
    cost: number | null,
    tokens: number | null,
    tokenBreakdown: TokenBreakdown | null,
    type: string,
  ): string {
    switch (type) {
      case "cost":
        return formatCost(cost);
      case "tokens":
        return formatTokens(tokens);
      case "both":
        return `${formatCost(cost)} (${formatTokens(tokens)})`;
      case "breakdown":
        return formatTokenBreakdown(tokenBreakdown);
      default:
        return formatCost(cost);
    }
  }

  private formatUsageWithBudget(
    cost: number | null,
    tokens: number | null,
    tokenBreakdown: TokenBreakdown | null,
    type: string,
    budget: number | undefined,
    warningThreshold = 80,
    budgetType?: "cost" | "tokens",
  ): string {
    const baseDisplay = this.formatUsageDisplay(
      cost,
      tokens,
      tokenBreakdown,
      type,
    );

    if (budget && budget > 0) {
      let budgetValue: number | null = null;

      if (budgetType === "tokens" && tokens !== null) {
        budgetValue = tokens;
      } else if (budgetType === "cost" && cost !== null) {
        budgetValue = cost;
      } else if (!budgetType && cost !== null) {
        budgetValue = cost;
      }

      if (budgetValue !== null) {
        const budgetStatus = getBudgetStatus(
          budgetValue,
          budget,
          warningThreshold,
        );
        return baseDisplay + budgetStatus.displayText;
      }
    }

    return baseDisplay;
  }

  renderVersion(
    hookData: ClaudeHookData,
    colors: PowerlineColors,
    _config?: VersionSegmentConfig,
  ): SegmentData | null {
    if (!hookData.version) {
      return null;
    }

    return {
      text: applyLabel(symPrefix(this.symbols.version, `v${hookData.version}`), _config?.label),
      bgColor: colors.versionBg,
      fgColor: colors.versionFg,
    };
  }

  renderEnv(
    colors: PowerlineColors,
    config: EnvSegmentConfig,
  ): SegmentData | null {
    const value = process.env[config.variable];
    if (!value) return null;
    const prefix = config.prefix ?? config.variable;
    const text = prefix
      ? `${this.symbols.env} ${prefix}: ${value}`
      : `${this.symbols.env} ${value}`;
    return { text, bgColor: colors.envBg, fgColor: colors.envFg };
  }
}
