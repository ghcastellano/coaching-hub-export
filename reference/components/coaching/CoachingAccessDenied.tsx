// @ts-nocheck
import React from 'react';

// Shown when a connected user whose email is not on the Coaching Hub allowlist
// tries to reach #coaching-hub. The hub holds named-employee coaching data, so
// access is intentionally limited.
export default function CoachingAccessDenied({ email, onBack }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="card max-w-lg p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                    <span className="text-3xl" aria-hidden="true">
                        🔒
                    </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Access restricted</h1>
                <p className="mt-3 text-gray-600">
                    The Coaching Hub contains team coaching records and is limited to the coaching
                    and leadership group. Your account does not have access.
                </p>
                {email && (
                    <p className="mt-2 text-sm text-gray-400">
                        Signed in as <span className="font-medium text-gray-500">{email}</span>
                    </p>
                )}
                <p className="mt-4 text-sm text-gray-500">
                    If you believe you should have access, contact the Agile Coach to be added to
                    the allowlist.
                </p>
                {onBack && (
                    <button onClick={onBack} className="btn-secondary mt-6">
                        Back to the dashboard
                    </button>
                )}
            </div>
        </div>
    );
}
