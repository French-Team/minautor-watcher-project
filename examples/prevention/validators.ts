// Exemple : src/prevention/validators.ts
// Validations avec ESLint

import { ESLint } from 'eslint';

export class CodeValidator {
  private eslint: ESLint;

  constructor() {
    this.eslint = new ESLint({
      useEslintrc: true, // Utilise eslint.config.js
    });
  }

  async validate(filePath: string): Promise<boolean> {
    const results = await this.eslint.lintFiles([filePath]);
    const hasErrors = results.some(result => result.errorCount > 0);
    if (hasErrors) {
      console.log(`Erreurs détectées dans ${filePath}`);
    }
    return !hasErrors;
  }
}

// Utilisation :
const validator = new CodeValidator();
await validator.validate('./project/file.ts');
