import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: any): State {
    let message = "Something went wrong.";
    try {
      const parsed = JSON.parse(error.message || "");
      if (parsed && parsed.operationType) {
        message = `Database error during ${parsed.operationType} on ${parsed.path}. Please check your permissions.`;
      } else {
        message = error.message || "Something went wrong.";
      }
    } catch (e) {
      message = error.message || "Something went wrong.";
    }
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-red-100">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Application Error</h2>
            <p className="text-gray-600 mb-6">{this.state.errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

