/**
 * Unit tests for auth routing decision logic.
 *
 * Tests the pure deriveInitialRouteFromAuthState function that maps
 * normalized auth state to route descriptors, covering all combinations
 * of authentication and verification status as documented in
 * authRouting.ts lines 154-181.
 */

import {
  deriveInitialRouteFromAuthState,
  AuthRoutingInput,
  AuthRoute,
} from './authRouting';

describe('deriveInitialRouteFromAuthState', () => {
  describe('Unauthenticated users', () => {
    it('should route to login when unauthenticated and unverified', () => {
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login when unauthenticated even if verified flag is true', () => {
      // Impossible state: cannot be verified without being authenticated
      // But the function handles it safely by routing to login
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });
  });

  describe('Authenticated but unverified users', () => {
    it('should route to verify when authenticated but unverified', () => {
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });
  });

  describe('Authenticated and verified users', () => {
    it('should route to home when authenticated and verified', () => {
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });
  });

  describe('Function properties', () => {
    it('should be idempotent - same input always returns same output', () => {
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result1 = deriveInitialRouteFromAuthState(input);
      const result2 = deriveInitialRouteFromAuthState(input);
      const result3 = deriveInitialRouteFromAuthState(input);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe('verify');
    });

    it('should be deterministic - same values produce same result', () => {
      const input1: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const input2: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result1 = deriveInitialRouteFromAuthState(input1);
      const result2 = deriveInitialRouteFromAuthState(input2);

      expect(result1).toBe(result2);
      expect(result1).toBe('home');
    });

    it('should be a pure function with no side effects', () => {
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      // Call function and verify input is not mutated
      const inputCopy = { ...input };
      deriveInitialRouteFromAuthState(input);

      expect(input).toEqual(inputCopy);
    });
  });

  describe('Complete coverage matrix', () => {
    it('should handle all four possible boolean combinations correctly', () => {
      // Test all 2x2 combinations exhaustively
      const testCases: {
        input: AuthRoutingInput;
        expected: AuthRoute;
        description: string;
      }[] = [
        {
          input: { isAuthenticated: false, isVerified: false },
          expected: 'login',
          description: 'unauthenticated and unverified',
        },
        {
          input: { isAuthenticated: false, isVerified: true },
          expected: 'login',
          description: 'unauthenticated but verified (impossible state)',
        },
        {
          input: { isAuthenticated: true, isVerified: false },
          expected: 'verify',
          description: 'authenticated but unverified',
        },
        {
          input: { isAuthenticated: true, isVerified: true },
          expected: 'home',
          description: 'authenticated and verified',
        },
      ];

      testCases.forEach(({ input, expected, description }) => {
        const result = deriveInitialRouteFromAuthState(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Security model', () => {
    it('should implement fail-safe defaults by routing to login for unauthenticated users', () => {
      // Security model: deny access by default
      const unauthenticatedInputs: AuthRoutingInput[] = [
        { isAuthenticated: false, isVerified: false },
        { isAuthenticated: false, isVerified: true },
      ];

      unauthenticatedInputs.forEach((input) => {
        const result = deriveInitialRouteFromAuthState(input);
        expect(result).toBe('login');
      });
    });

    it('should require explicit verification flag for home access', () => {
      // Only authenticated AND verified users get home access
      const deniedInputs: AuthRoutingInput[] = [
        { isAuthenticated: false, isVerified: false },
        { isAuthenticated: false, isVerified: true },
        { isAuthenticated: true, isVerified: false },
      ];

      deniedInputs.forEach((input) => {
        const result = deriveInitialRouteFromAuthState(input);
        expect(result).not.toBe('home');
      });

      // Only this combination grants home access
      const allowedInput: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };
      const allowedResult = deriveInitialRouteFromAuthState(allowedInput);
      expect(allowedResult).toBe('home');
    });

    it('should have no bypass mechanisms or special cases', () => {
      // Verify that the routing follows strict rules with no exceptions
      // Auth gate: must be authenticated
      expect(
        deriveInitialRouteFromAuthState({
          isAuthenticated: false,
          isVerified: true,
        })
      ).toBe('login');

      // Verification gate: must be verified for home access
      expect(
        deriveInitialRouteFromAuthState({
          isAuthenticated: true,
          isVerified: false,
        })
      ).toBe('verify');

      // Both gates passed: home access
      expect(
        deriveInitialRouteFromAuthState({
          isAuthenticated: true,
          isVerified: true,
        })
      ).toBe('home');
    });
  });

  describe('Type safety', () => {
    it('should accept valid AuthRoutingInput and return AuthRoute', () => {
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result: AuthRoute = deriveInitialRouteFromAuthState(input);

      // TypeScript compilation ensures type safety
      expect(['login', 'verify', 'home']).toContain(result);
    });
  });

  describe('Real-world scenarios', () => {
    it('should route user after successful login to verify if email not confirmed', () => {
      // User just logged in but email is not verified
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });

    it('should route user after successful login to home if email already confirmed', () => {
      // User logged in with verified email
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should route user to login after session restore fails', () => {
      // Session restore failed, user is logged out
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route user to home after successful session restore with verified email', () => {
      // Session restored successfully, user has verified email
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should route user to verify after successful session restore with unverified email', () => {
      // Session restored successfully, but email still needs verification
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });

    it('should route user to login after logout', () => {
      // User explicitly logged out
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route user to login after token refresh fails with auth error', () => {
      // Token refresh failed with auth error, user is logged out
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should maintain home route when user is already authenticated and verified', () => {
      // User is in app, already authenticated and verified
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });
  });

  describe('Cold start scenarios', () => {
    it('should route to login on first app launch with no stored session', () => {
      // First app launch, no prior session exists
      // authRestore returns: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to home on cold start with valid cached session', () => {
      // App restarted, session successfully restored
      // authRestore returns: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should route to login on cold start when cached session expired', () => {
      // Cold start with expired session (cleared by authRestore)
      // authRestore detects auth error, clears session
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login on cold start with corrupted session data', () => {
      // Cold start with corrupted/invalid session storage
      // authRestore detects corruption, clears session
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to home on cold start offline within trust window', () => {
      // Cold start offline, cached session < 7 days old
      // authRestore trusts cached session, marks needsRefresh
      // Result: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should route to verify on cold start offline with unverified cached session', () => {
      // Cold start offline, cached session has unverified email
      // authRestore trusts cached session within trust window
      // Result: isAuthenticated=true, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });

    it('should route to login on cold start offline beyond trust window', () => {
      // Cold start offline, cached session > 7 days old
      // authRestore clears stale session
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });
  });

  describe('Forced logout scenarios', () => {
    it('should route to login after forced logout due to token expiration', () => {
      // Token refresh failed with 401/403 auth error
      // Store marks user as unauthenticated
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login after forced logout due to invalid session', () => {
      // Session invalidated by server (user deleted, password changed, etc.)
      // Auth error triggers logout
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login after forced logout due to security policy', () => {
      // Security policy violation triggers forced logout
      // Store clears auth state
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login after forced logout from home screen', () => {
      // User was on home screen, token expired
      // Previous: isAuthenticated=true, isVerified=true
      // After logout: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login after forced logout from verify screen', () => {
      // User was on verify screen, session invalidated
      // Previous: isAuthenticated=true, isVerified=false
      // After logout: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to login after explicit user logout action', () => {
      // User clicked logout button
      // useLogout hook clears all auth state
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });
  });

  describe('Session state transition scenarios', () => {
    it('should route to home when email verification completes in-app', () => {
      // User was on verify screen, clicked email link, returned to app
      // Previous: isAuthenticated=true, isVerified=false
      // After verification: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should route to login when session expires while user in app', () => {
      // User was browsing, session expired, refresh failed
      // Previous: isAuthenticated=true, isVerified=true
      // After expiry: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to verify when verification status revoked', () => {
      // Unusual case: email verification revoked by admin
      // Previous: isAuthenticated=true, isVerified=true
      // After revocation: isAuthenticated=true, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });

    it('should route to login when authentication lost mid-session', () => {
      // Network issue, token refresh fails with auth error
      // Previous: isAuthenticated=true, isVerified=X
      // After auth loss: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should route to home after completing full authentication flow', () => {
      // User completed: login -> email verification -> confirmed
      // Previous: various states during flow
      // Final: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });
  });

  describe('Deep link navigation scenarios', () => {
    it('should route to login for deep link when unauthenticated', () => {
      // Deep link to /wardrobe/items/123 clicked
      // User not authenticated, must login first
      // Result: isAuthenticated=false, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      // Deep link should be preserved, but user routed to login
      expect(result).toBe('login');
    });

    it('should route to verify for deep link when authenticated but unverified', () => {
      // Deep link clicked, user authenticated but email not verified
      // Must verify email before accessing protected content
      // Result: isAuthenticated=true, isVerified=false
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });

    it('should route to home for deep link when fully authenticated', () => {
      // Deep link clicked, user fully authenticated
      // Can proceed to deep-linked content
      // Result: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should route to home for verify deep link when already verified', () => {
      // User clicks old email verification link
      // Already verified and authenticated
      // Result: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      // Should redirect to home, not stay on verify
      expect(result).toBe('home');
    });

    it('should route to home for login deep link when authenticated', () => {
      // User clicks login link while already authenticated
      // Result: isAuthenticated=true, isVerified=true
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      // Should redirect to home, not show login
      expect(result).toBe('home');
    });
  });

  describe('Route protection validation scenarios', () => {
    it('should deny home access without authentication', () => {
      // Attempting to access /home route
      // Result: isAuthenticated=false, isVerified=X
      const unauthenticated: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      expect(deriveInitialRouteFromAuthState(unauthenticated)).toBe('login');

      // Even with verified flag (impossible state)
      const unauthButVerified: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: true,
      };

      expect(deriveInitialRouteFromAuthState(unauthButVerified)).toBe('login');
    });

    it('should deny home access without email verification', () => {
      // Attempting to access /home route
      // Authenticated but not verified
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
      expect(result).not.toBe('home');
    });

    it('should require authentication for verify route access', () => {
      // Attempting to access /verify route without auth
      // Should redirect to login first
      const input: AuthRoutingInput = {
        isAuthenticated: false,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('login');
    });

    it('should redirect from verify to home when verification complete', () => {
      // User on verify screen, verification just completed
      // Should now route to home
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should redirect from login to home when user already authenticated', () => {
      // User navigates to /login but already authenticated
      // Should redirect to appropriate authenticated route
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('home');
    });

    it('should redirect from login to verify when authenticated but unverified', () => {
      // User navigates to /login but already authenticated
      // Email not verified, should go to verify screen
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const result = deriveInitialRouteFromAuthState(input);

      expect(result).toBe('verify');
    });
  });

  describe('Idempotency across scenarios', () => {
    it('should produce same route for same state regardless of how state was reached', () => {
      // Multiple paths can lead to authenticated + verified state:
      // - Successful login with verified email
      // - Successful session restore
      // - Just completed email verification
      // - Returning from background with valid session

      const loginPath: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const restorePath: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const verificationPath: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      const backgroundPath: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: true,
      };

      // All should produce same route
      expect(deriveInitialRouteFromAuthState(loginPath)).toBe('home');
      expect(deriveInitialRouteFromAuthState(restorePath)).toBe('home');
      expect(deriveInitialRouteFromAuthState(verificationPath)).toBe('home');
      expect(deriveInitialRouteFromAuthState(backgroundPath)).toBe('home');

      // Verify all are identical
      const routes = [
        deriveInitialRouteFromAuthState(loginPath),
        deriveInitialRouteFromAuthState(restorePath),
        deriveInitialRouteFromAuthState(verificationPath),
        deriveInitialRouteFromAuthState(backgroundPath),
      ];

      expect(new Set(routes).size).toBe(1);
    });

    it('should handle rapid consecutive calls with same input consistently', () => {
      // Simulating rapid state checks (e.g., during navigation)
      const input: AuthRoutingInput = {
        isAuthenticated: true,
        isVerified: false,
      };

      const results = Array.from({ length: 100 }, () =>
        deriveInitialRouteFromAuthState(input)
      );

      // All results should be identical
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe('verify');
    });

    it('should have no state leakage between different scenario calls', () => {
      // Call with different inputs in sequence
      const inputs: AuthRoutingInput[] = [
        { isAuthenticated: false, isVerified: false },
        { isAuthenticated: true, isVerified: false },
        { isAuthenticated: true, isVerified: true },
        { isAuthenticated: false, isVerified: true },
      ];

      const expectedRoutes: AuthRoute[] = ['login', 'verify', 'home', 'login'];

      inputs.forEach((input, index) => {
        const result = deriveInitialRouteFromAuthState(input);
        expect(result).toBe(expectedRoutes[index]);
      });

      // Verify calling in reverse order produces same results
      const reversedInputs = [...inputs].reverse();
      const reversedExpected = [...expectedRoutes].reverse();

      reversedInputs.forEach((input, index) => {
        const result = deriveInitialRouteFromAuthState(input);
        expect(result).toBe(reversedExpected[index]);
      });
    });
  });

  describe('Comprehensive scenario coverage matrix', () => {
    it('should handle all documented cold start outcomes correctly', () => {
      // Testing all possible cold start results from authRestore
      const scenarios: {
        description: string;
        input: AuthRoutingInput;
        expected: AuthRoute;
      }[] = [
        {
          description: 'no stored session',
          input: { isAuthenticated: false, isVerified: false },
          expected: 'login',
        },
        {
          description: 'valid session restored',
          input: { isAuthenticated: true, isVerified: true },
          expected: 'home',
        },
        {
          description: 'valid unverified session restored',
          input: { isAuthenticated: true, isVerified: false },
          expected: 'verify',
        },
        {
          description: 'session expired - auth error',
          input: { isAuthenticated: false, isVerified: false },
          expected: 'login',
        },
        {
          description: 'corrupted session cleared',
          input: { isAuthenticated: false, isVerified: false },
          expected: 'login',
        },
        {
          description: 'offline trusted session',
          input: { isAuthenticated: true, isVerified: true },
          expected: 'home',
        },
        {
          description: 'offline stale session cleared',
          input: { isAuthenticated: false, isVerified: false },
          expected: 'login',
        },
      ];

      scenarios.forEach(({ description, input, expected }) => {
        const result = deriveInitialRouteFromAuthState(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle all documented logout outcomes correctly', () => {
      // All forced logout scenarios result in unauthenticated state
      const logoutScenarios = [
        'token expiration',
        'invalid session',
        'security policy violation',
        'user logout action',
        'concurrent session conflict',
        'account deletion',
        'password change',
      ];

      logoutScenarios.forEach((scenario) => {
        // After any logout, user is unauthenticated
        const input: AuthRoutingInput = {
          isAuthenticated: false,
          isVerified: false,
        };

        const result = deriveInitialRouteFromAuthState(input);
        expect(result).toBe('login');
      });
    });

    it('should serve as executable specification for all auth routing decisions', () => {
      // Complete truth table for all possible states
      const completeMatrix: {
        isAuthenticated: boolean;
        isVerified: boolean;
        expectedRoute: AuthRoute;
        explanation: string;
      }[] = [
        {
          isAuthenticated: false,
          isVerified: false,
          expectedRoute: 'login',
          explanation: 'No auth, no verification -> must login',
        },
        {
          isAuthenticated: false,
          isVerified: true,
          expectedRoute: 'login',
          explanation: 'Impossible state, fail-safe to login',
        },
        {
          isAuthenticated: true,
          isVerified: false,
          expectedRoute: 'verify',
          explanation: 'Authenticated but unverified -> verify email',
        },
        {
          isAuthenticated: true,
          isVerified: true,
          expectedRoute: 'home',
          explanation: 'Fully authenticated and verified -> grant access',
        },
      ];

      completeMatrix.forEach(
        ({ isAuthenticated, isVerified, expectedRoute, explanation }) => {
          const input: AuthRoutingInput = { isAuthenticated, isVerified };
          const result = deriveInitialRouteFromAuthState(input);

          expect(result).toBe(expectedRoute);
        }
      );
    });
  });
});
