import {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationRedirectChainAllowed,
  assertBrowserNavigationResultAllowed,
  deriveAllowedBrowserDomainsFromConnection,
  InvalidBrowserNavigationUrlError,
} from "../services/browserNavigationGuard.js";

describe("browserNavigationGuard", () => {
  it("derives allowed domains from connection login and target URLs", () => {
    expect(
      deriveAllowedBrowserDomainsFromConnection({
        loginUrl: "https://accounts.erp.local/login",
        targetSite: "https://erp.local/app",
      }),
    ).toEqual(["accounts.erp.local", "erp.local"]);
  });

  it("allows http and https navigation when no domain policy is configured", async () => {
    await expect(
      assertBrowserNavigationAllowed({
        url: "https://example.com/dashboard",
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertBrowserNavigationAllowed({
        url: "http://example.com/dashboard",
      }),
    ).resolves.toBeUndefined();
  });

  it("allows about:blank as the only safe non-network navigation URL", async () => {
    await expect(
      assertBrowserNavigationAllowed({
        url: "about:blank",
      }),
    ).resolves.toBeUndefined();
  });

  it("blocks unsupported protocols", async () => {
    await expect(
      assertBrowserNavigationAllowed({
        url: "file:///tmp/secret.txt",
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);

    await expect(
      assertBrowserNavigationAllowed({
        url: "javascript:alert(1)",
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
  });

  it("blocks navigation outside the allowed domains policy", async () => {
    await expect(
      assertBrowserNavigationAllowed({
        url: "https://portal.outrodominio.com/login",
        allowedDomains: ["erp.local"],
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
  });

  it("allows subdomains covered by the allowed domains policy", async () => {
    await expect(
      assertBrowserNavigationAllowed({
        url: "https://accounts.erp.local/login",
        allowedDomains: ["erp.local"],
      }),
    ).resolves.toBeUndefined();
  });

  it("ignores browser-internal final URLs after navigation", async () => {
    await expect(
      assertBrowserNavigationResultAllowed({
        url: "chrome-error://chromewebdata/",
        allowedDomains: ["erp.local"],
      }),
    ).resolves.toBeUndefined();
  });

  it("validates every redirect hop against the domain policy", async () => {
    const finalRequest = {
      url: () => "https://erp.local/final",
      redirectedFrom: () => ({
        url: () => "https://sso.outrodominio.com/login",
        redirectedFrom: () => ({
          url: () => "https://erp.local/start",
          redirectedFrom: () => null,
        }),
      }),
    };

    await expect(
      assertBrowserNavigationRedirectChainAllowed({
        request: finalRequest,
        allowedDomains: ["erp.local"],
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
  });
});
