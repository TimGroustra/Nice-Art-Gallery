import { toast } from "sonner";

export const showSuccess = (message: string) => {
  // Notifications disabled
  // toast.success(message);
};

export const showError = (message: string) => {
  // Notifications disabled
  // toast.error(message);
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};