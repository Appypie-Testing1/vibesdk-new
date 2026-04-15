// Expo/Metro readiness patterns for sandbox dev server detection
export const EXPO_READINESS_PATTERNS: RegExp[] = [
    /exp:\/\/[^\s]+/,
    /Metro waiting on/i,
    /Starting Metro/i,
];
