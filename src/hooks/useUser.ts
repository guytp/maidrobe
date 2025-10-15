import { useQuery } from '@tanstack/react-query';

// Sample user type
export interface User {
  id: string;
  name: string;
  email: string;
}

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

// React Query hook for fetching user data
export const useUser = (userId: string) => {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    enabled: !!userId, // Only fetch if userId is provided
  });
};
