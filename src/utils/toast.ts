import { toast } from "sonner";

export const showSuccess = (message: string) => {
  // Toasts disabled by user request.
};

export const showError = (message: string) => {
  // Toasts disabled by user request.
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};