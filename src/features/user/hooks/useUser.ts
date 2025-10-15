import { useQuery } from '@tanstack/react-query';
import { User } from '../types';

// Mock API function - in a real app, this would fetch from your API
const fetchUser = async (userId: string): Promise<User> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Mock user data
  return {
    id: userId,
    name: 'Sample User',
    email: 'user@example.com',
  };
};

/**
 * Custom React Query hook for fetching user data
 *
 * This hook manages the fetching, caching, and state of user data using React Query.
 * It provides loading states, error handling, and automatic refetching capabilities.
 *
 * @param userId - The unique identifier of the user to fetch
 * @returns React Query result object containing:
 *   - data: User object with id, name, and email (undefined while loading or on error)
 *   - isLoading: Boolean indicating if the initial fetch is in progress
 *   - error: Error object if the fetch failed (null otherwise)
 *   - refetch: Function to manually trigger a refetch
 *   - ...other React Query result properties
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const { data: user, isLoading, error } = useUser('user-123');
 *
 *   if (isLoading) return <Text>Loading...</Text>;
 *   if (error) return <Text>Error: {error.message}</Text>;
 *   if (!user) return null;
 *
 *   return (
 *     <View>
 *       <Text>Name: {user.name}</Text>
 *       <Text>Email: {user.email}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export const useUser = (userId: string) => {
  return useQuery({
    // Cache key pattern must include userId to ensure query consistency
    // and prevent data from different users being cached under the same key
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    enabled: !!userId, // Only fetch if userId is provided
  });
};
