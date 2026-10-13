import type { DecodedLaunch, LaunchEnrichment } from '../chain/types.js';
import { hasNonZeroOwner, hasPrivilegedSelector } from '../chain/enrich.js';
import { isVerifiedHook } from '../contracts/runitup.js';

export interface RiskLabel {
  code: string;
  detail: string;
}

const unsafeText = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

/** Conservative labels are observations, never an approval or trading signal. */
export function labelRisks(launch: DecodedLaunch, enrichment: LaunchEnrichment): readonly RiskLabel[] {
  const labels: RiskLabel[] = [];
  const { token, transaction } = enrichment;
  if (token.unavailable.length) labels.push({ code: 'DATA_UNAVAILABLE', detail: token.unavailable.join(', ') });
  // This service does not fetch/attest each newly created token's source code.
  labels.push({ code: 'SOURCE_UNVERIFIED', detail: 'Token source verification was not established by this watcher.' });
  if (token.proxy) labels.push({ code: 'PROXY_OR_UPGRADEABLE', detail: 'EIP-1967 implementation slot is non-zero.' });
  const selectors = hasPrivilegedSelector(token.bytecode);
  if (selectors.length) labels.push({ code: 'PRIVILEGED_SELECTOR', detail: `Runtime bytecode contains selector(s): ${selectors.join(', ')}.` });
  if (hasNonZeroOwner(token.owner)) labels.push({ code: 'OWNER_NONZERO', detail: `owner() returns ${token.owner}.` });
  if (launch.totalSupply !== undefined && token.totalSupply !== undefined && launch.totalSupply !== token.totalSupply) {
    labels.push({ code: 'SUPPLY_MISMATCH', detail: 'Factory event totalSupply differs from token totalSupply().' });
  }
  if (token.creatorBalance !== undefined && token.totalSupply && token.totalSupply > 0n && token.creatorBalance * 10_000n >= token.totalSupply * 2_000n) {
    labels.push({ code: 'CREATOR_HOLDINGS_HIGH', detail: 'Creator balance is at least 20% of totalSupply at enrichment time.' });
  }
  const observedHook = launch.hook ?? transaction.hook;
  if (observedHook && !isVerifiedHook(observedHook)) labels.push({ code: 'HOOK_NOT_ALLOWLISTED', detail: `Observed hook ${observedHook} is absent from verified registry.` });
  if ([token.name, token.symbol].some((value) => value && unsafeText.test(value))) {
    labels.push({ code: 'UNSAFE_METADATA_TEXT', detail: 'Name or symbol contains a control or bidirectional character.' });
  }
  return labels;
}
