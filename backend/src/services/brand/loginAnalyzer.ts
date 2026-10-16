import { Evidence } from "../url/types";
import { ContentAnalysisResult } from "../content/types";
import { LoginContextResult } from "./types";

export function analyzeLoginContext(
  content: ContentAnalysisResult,
  text: string,
): LoginContextResult {
  const authenticationWords =
    /login|log in|sign in|signin|authenticate|account|verify|password|username|security code/i;
  const forms = content.forms;
  const passwordFieldCount = forms.reduce(
    (sum, form) => sum + form.passwordInputCount,
    0,
  );
  const emailFieldCount = forms.reduce(
    (sum, form) => sum + form.emailInputCount,
    0,
  );
  const externalFormCount = forms.filter((form) => form.externalAction).length;
  const indicators = [
    ...(authenticationWords.test(text) ? ["authentication wording"] : []),
    ...(passwordFieldCount ? ["password field"] : []),
    ...(emailFieldCount ? ["email field"] : []),
    ...(externalFormCount ? ["external form action"] : []),
  ];
  const loginOriented = indicators.length > 0;
  const credentialCollection =
    passwordFieldCount > 0 ||
    (emailFieldCount > 0 && forms.some((form) => form.hasCredentialLikeFields));
  const evidence: Evidence[] = [];
  if (loginOriented)
    evidence.push({
      type: "login-context",
      severity: "info",
      title: "Login-oriented page context detected",
      description:
        "Authentication wording or form fields were observed; legitimate login pages commonly contain these signals.",
      source: "login-analyzer",
    });
  if (credentialCollection)
    evidence.push({
      type: "credential-collection",
      severity: "low",
      title: "Credential collection form detected",
      description:
        "A form contains credential-like fields. No credentials were submitted or stored.",
      source: "login-analyzer",
    });
  return {
    loginOriented,
    credentialCollection,
    indicators,
    formCount: forms.length,
    passwordFieldCount,
    emailFieldCount,
    externalFormCount,
    evidence,
  };
}
