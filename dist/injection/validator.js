/**
 * ConsignmentValidator - Prevention integration for consignment files
 * Validates that required agent guidance files exist in a project
 */
import { checkInjectionStatus } from "./detector.js";
import { injectFiles } from "./injector.js";
const DEFAULT_VALIDATOR_CONFIG = {
    enabled: true,
    requiredAgents: ["claude", "generic"],
    autoFix: false,
};
/**
 * Validate that consignment files exist in a project directory
 */
export async function validateConsignmentFiles(projectDir, validatorConfig) {
    const config = { ...DEFAULT_VALIDATOR_CONFIG, ...validatorConfig };
    const result = {
        isValid: true,
        errors: [],
        warnings: [],
    };
    if (!config.enabled) {
        return result;
    }
    try {
        const status = await checkInjectionStatus({
            projectDir,
            agents: config.requiredAgents,
            config: config.config,
        });
        for (const agentStatus of status.agents) {
            if (!agentStatus.present) {
                const severity = config.autoFix ? "warning" : "error";
                result.errors.push({
                    rule: "consignment-file-missing",
                    message: `Missing consignment file: ${agentStatus.fileName} for agent ${agentStatus.agent}`,
                    file: agentStatus.filePath,
                    severity,
                    code: "CONSIGNMENT_MISSING",
                });
                result.isValid = false;
            }
            else if (agentStatus.outdated) {
                result.warnings.push({
                    rule: "consignment-file-outdated",
                    message: `Outdated consignment file: ${agentStatus.fileName} (v${agentStatus.currentVersion} → v${agentStatus.templateVersion})`,
                    file: agentStatus.filePath,
                    severity: "warning",
                });
            }
        }
        if (!result.isValid && config.autoFix) {
            try {
                const injectResult = await injectFiles({
                    projectDir,
                    agents: config.requiredAgents,
                    config: config.config,
                    force: false,
                });
                const errors = injectResult.filter((r) => r.action === "error");
                if (errors.length === 0) {
                    result.isValid = true;
                    result.errors = [];
                    const createdCount = injectResult.filter((r) => r.action === "created").length;
                    result.warnings.push({
                        rule: "consignment-auto-fixed",
                        message: `Auto-injected ${createdCount} missing consignment file(s)`,
                        file: projectDir,
                        severity: "warning",
                    });
                }
            }
            catch (injectError) {
                const message = injectError instanceof Error
                    ? injectError.message
                    : String(injectError);
                result.errors.push({
                    rule: "consignment-inject-failed",
                    message: `Failed to auto-inject consignment files: ${message}`,
                    file: projectDir,
                    severity: "error",
                    code: "CONSIGNMENT_INJECT_FAILED",
                });
            }
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.isValid = false;
        result.errors.push({
            rule: "consignment-check-failed",
            message: `Failed to check consignment files: ${message}`,
            file: projectDir,
            severity: "error",
            code: "CONSIGNMENT_CHECK_FAILED",
        });
    }
    return result;
}
/**
 * Get a human-readable summary of validation results
 */
export function formatConsignmentResult(result) {
    const lines = [];
    if (result.isValid) {
        lines.push("Consignment files: OK");
    }
    else {
        lines.push("Consignment files: ISSUES FOUND");
    }
    for (const error of result.errors) {
        lines.push(`  ERROR: ${error.message}`);
    }
    for (const warning of result.warnings) {
        lines.push(`  WARN: ${warning.message}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=validator.js.map