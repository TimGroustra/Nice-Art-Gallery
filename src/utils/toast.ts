import { toast } from "sonner";

export const showSuccess = (message: string) => {
  // Notifications disabled
  return undefined;
};

export const showError = (message: string) => {
  // Notifications disabled
  return undefined;
};

export const showLoading = (message: string) => {
  // Notifications disabled
  return undefined;
};

export const dismissToast = (toastId: string) => {
  // Since toasts are disabled, this function will do nothing if called with a disabled toast ID.
  toast.dismiss(toastId);
};