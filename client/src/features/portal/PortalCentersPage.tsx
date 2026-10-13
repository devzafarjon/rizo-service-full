import { CentersList } from "../public/CentersPublicPage";

/** The service centres, inside the portal (the customer stays signed in and keeps the portal's menu). */
export function PortalCentersPage() {
  return <CentersList inPortal />;
}
