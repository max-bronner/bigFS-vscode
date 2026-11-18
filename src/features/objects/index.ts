import type { ExtensionContext } from 'vscode';
import { SAGE_INI_LANGUAGE } from '../../constants';
import type { Services } from '../../services/createServices';
import { registerEffectiveObjects } from './effectiveObjectView';
import { registerObjectPreview } from './objectPreview';
import { registerNewObjectWizard } from './newObjectWizard';

export const registerObjects = (
  context: ExtensionContext,
  { iniDocuments, iniIndex, locator, archives }: Services,
): void => {
  const selector = { language: SAGE_INI_LANGUAGE };

  context.subscriptions.push(
    ...registerEffectiveObjects(selector, iniDocuments, iniIndex),
    ...registerObjectPreview(
      context,
      selector,
      iniDocuments,
      iniIndex,
      locator,
    ),
    registerNewObjectWizard(iniDocuments, iniIndex, archives),
  );
};
