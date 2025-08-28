interface LoadingSpinnerProps {
    size?: 'small' | 'medium' | 'large';
    message?: string;
}

function LoadingSpinner({ size = 'medium', message }: LoadingSpinnerProps) {
    const sizeClasses = {
        small: 'w-6 h-6 border-2',
        medium: 'w-10 h-10 border-3',
        large: 'w-16 h-16 border-4'
    };

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className={`${sizeClasses[size]} border-blue-600 border-t-transparent rounded-full animate-spin`}></div>
            {message && <p className="mt-2 text-gray-400">{message}</p>}
        </div>
    );
}

export default LoadingSpinner;