import React from 'react';

const ConfigWarning: React.FC = () => {
  const hasMissingConfig = 
    import.meta.env.VITE_SUPABASE_URL?.includes('your-project-ref') || 
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.includes('your-walletconnect-project-id');

  if (!hasMissingConfig) return null;

  return (
    <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-500/90 text-black px-4 py-2 rounded-lg shadow-lg animate-pulse">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-medium">
          Please configure environment variables in <code className="bg-black/20 px-1 rounded">.env.local</code>
        </span>
      </div>
    </div>
  );
};

export default ConfigWarning;