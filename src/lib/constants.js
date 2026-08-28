import { PairingDisplayStatus } from "../pairing-lifecycle.js";

export const EXTENSION_RELEASES_URL = "https://github.com/Bazingalol123/magpie/releases/latest";

export const PAIRING_STATUS_COPY = {
  [PairingDisplayStatus.AWAITING_SETUP]: {
    label: "Awaiting setup",
    detail: "The token was created, but no Extension has confirmed it yet.",
  },
  [PairingDisplayStatus.CONNECTED_UNUSED]: {
    label: "Connected",
    detail: "The Extension connected successfully. No captures yet.",
  },
  [PairingDisplayStatus.ACTIVE]: {
    label: "Active",
    detail: "This browser has captured successfully.",
  },
  [PairingDisplayStatus.REVOKED]: {
    label: "Revoked",
    detail: "This token can no longer submit captures.",
  },
};
