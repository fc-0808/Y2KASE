# Implementation Plan: Y2KASE Enhancements

## Overview

This implementation plan transforms the Y2KASE prototype into a fully functional e-commerce store. Tasks are organized to build foundational elements first, then layer on features incrementally. Each task builds on previous work, ensuring no orphaned code.

## Tasks

- [ ] 1. Set up testing infrastructure and fix code quality issues

  - [ ] 1.1 Install testing dependencies (Vitest, fast-check, React Testing Library)

    - Add vitest, @vitejs/plugin-react, fast-check, @testing-library/react, @testing-library/jest-dom to devDependencies
    - Create vitest.config.ts with path aliases and jsdom environment
    - Create src/test/setup.ts for test configuration
    - _Requirements: 9.1_

  - [ ] 1.2 Fix Tailwind CSS v4 class name warnings

    - Replace `bg-gradient-to-r` with `bg-linear-to-r` in cart/page.tsx and products/page.tsx
    - Replace `aspect-[3/4]` with `aspect-3/4` in products/page.tsx
    - _Requirements: 9.2_

  - [x] 1.3 Fix environment variable naming inconsistency
    - ~~Update scripts/import-reviews.js to use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY~~
    - Already using correct variable name - DONE
    - _Requirements: 9.4_

- [ ] 2. Create middleware for session management

  - [ ] 2.1 Create middleware.ts at project root

    - Implement session refresh using Supabase SSR
    - Configure matcher to exclude static files and images
    - Handle session refresh errors gracefully
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 2.2 Write property test for middleware route matching
    - **Property 8: Middleware Processes Requests Correctly**
    - **Validates: Requirements 6.2, 6.3**

- [ ] 3. Create shared components

  - [ ] 3.1 Create Navbar component

    - Extract navigation from page.tsx into src/components/Navbar.tsx
    - Add scroll-aware background transition
    - Add cart item count badge from Zustand store
    - Add authentication-aware rendering (login link vs account menu)
    - _Requirements: 2.1, 2.4_

  - [ ] 3.2 Create Footer component

    - Extract footer from page.tsx into src/components/Footer.tsx
    - Ensure all links and social icons are functional
    - _Requirements: 2.2_

  - [ ] 3.3 Create ProductCard component

    - Create src/components/ProductCard.tsx with proper TypeScript interface
    - Accept Product as prop, render image, name, price, badges, rating, actions
    - Add hover effects and quick action buttons
    - _Requirements: 2.3, 2.5_

  - [ ] 3.4 Write property test for ProductCard rendering

    - **Property 2: ProductCard Renders All Required Information**
    - **Validates: Requirements 2.3, 2.5**

  - [ ] 3.5 Create Layout component

    - Create src/components/Layout.tsx wrapping Navbar and Footer
    - Support transparentNav and hideFooter props
    - _Requirements: 2.6_

  - [ ] 3.6 Create ErrorBoundary component

    - Create src/components/ErrorBoundary.tsx as class component
    - Implement fallback UI with Y2K aesthetic
    - Add error logging
    - _Requirements: 8.3_

  - [ ] 3.7 Write property test for ErrorBoundary

    - **Property 10: Error Boundaries Prevent Crashes**
    - **Validates: Requirements 8.2, 8.3**

  - [ ] 3.8 Create loading skeleton components
    - Create src/components/Skeleton.tsx with ProductCardSkeleton, ProductDetailSkeleton
    - Match Y2K aesthetic with gradient animations
    - _Requirements: 8.1_

- [ ] 4. Checkpoint - Ensure all component tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement database integration

  - [ ] 5.1 Create Supabase query functions

    - Create src/lib/supabase/queries.ts
    - Implement getProducts() with filtering, sorting, and related data joins
    - Implement getProductBySlug() for single product fetch
    - Implement getProductReviews() for product reviews
    - Implement getCategories() and getCollections()
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ] 5.2 Write property test for product fetching

    - **Property 1: Product Fetching Returns Correct Data**
    - **Validates: Requirements 1.1, 1.2, 1.4**

  - [ ] 5.3 Update products page to use real data

    - Replace MOCK_PRODUCTS with server-side data fetching
    - Add loading state with skeleton components
    - Add error handling with retry option
    - _Requirements: 1.1, 1.3, 8.1, 8.2_

  - [ ] 5.4 Refactor products page to use shared components
    - Replace inline navigation with Layout component
    - Replace inline product cards with ProductCard component
    - _Requirements: 2.3, 2.6_

- [ ] 6. Checkpoint - Ensure database integration works

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Create product detail page

  - [ ] 7.1 Create product detail page route

    - Create src/app/products/[slug]/page.tsx
    - Implement server-side data fetching with getProductBySlug
    - Add generateMetadata for SEO
    - _Requirements: 3.1, 3.2_

  - [ ] 7.2 Create ProductGallery component

    - Create src/components/ProductGallery.tsx
    - Implement main image display with thumbnail navigation
    - Support image zoom on hover
    - _Requirements: 3.3_

  - [ ] 7.3 Create VariantSelector component

    - Create src/components/VariantSelector.tsx
    - Display option selectors based on product's option1_label and option2_label
    - Update selected variant state on selection
    - _Requirements: 3.4_

  - [ ] 7.4 Create AddToCartButton component

    - Create src/components/AddToCartButton.tsx
    - Include quantity selector
    - Integrate with Zustand cart store
    - Show success notification on add
    - _Requirements: 3.6_

  - [ ] 7.5 Write property test for variant selection and cart

    - **Property 4: Variant Selection Updates State Correctly**
    - **Validates: Requirements 3.5, 3.6**

  - [ ] 7.6 Create ProductReviews component

    - Create src/components/ProductReviews.tsx
    - Display reviews list with user name, rating, comment, date
    - Show average rating summary
    - _Requirements: 3.7_

  - [ ] 7.7 Write property test for product detail page

    - **Property 3: Product Detail Page Displays Complete Information**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.7**

  - [ ] 7.8 Create custom 404 page
    - Create src/app/not-found.tsx with Y2K aesthetic
    - Add navigation options back to home/products
    - _Requirements: 3.8, 8.4_

- [ ] 8. Checkpoint - Ensure product detail page works

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement authentication flow

  - [ ] 9.1 Create login page

    - Create src/app/login/page.tsx
    - Implement email/password form with validation
    - Integrate with Supabase Auth signInWithPassword
    - Handle success redirect and error display
    - _Requirements: 4.1, 4.3, 4.5, 4.6_

  - [ ] 9.2 Create signup page

    - Create src/app/signup/page.tsx
    - Implement registration form with email, password, confirm password
    - Integrate with Supabase Auth signUp
    - Handle success redirect and error display
    - _Requirements: 4.2, 4.4, 4.5, 4.6_

  - [ ] 9.3 Write property test for authentication

    - **Property 5: Authentication Handles Credentials Correctly**
    - **Validates: Requirements 4.3, 4.4, 4.6**

  - [ ] 9.4 Update Navbar with auth state

    - Add useUser hook integration
    - Show login link when unauthenticated
    - Show account dropdown with logout when authenticated
    - _Requirements: 4.7, 4.8_

  - [ ] 9.5 Write property test for auth state in UI

    - **Property 6: Authentication State Reflects in UI**
    - **Validates: Requirements 4.8, 4.9**

  - [ ] 9.6 Update Zustand user store
    - Enhance useUser store with Supabase session sync
    - Add session persistence logic
    - _Requirements: 4.9_

- [ ] 10. Checkpoint - Ensure authentication works

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement checkout flow

  - [ ] 11.1 Create checkout page

    - Create src/app/checkout/page.tsx
    - Redirect to cart if cart is empty
    - Display order summary with cart items
    - _Requirements: 5.1, 5.2_

  - [ ] 11.2 Create ShippingForm component

    - Create src/components/ShippingForm.tsx
    - Implement form fields for name, email, phone, address
    - Add form validation with error messages
    - Pre-fill for authenticated users
    - _Requirements: 5.3, 5.8, 5.9_

  - [ ] 11.3 Write property test for form validation

    - **Property 7: Checkout Validates and Processes Orders**
    - **Validates: Requirements 5.5, 5.8**

  - [ ] 11.4 Create Stripe checkout API route

    - Create src/app/api/checkout/route.ts
    - Implement POST handler to create Stripe checkout session
    - Include cart items, shipping info, and success/cancel URLs
    - _Requirements: 5.4, 5.5_

  - [ ] 11.5 Create order confirmation page

    - Create src/app/checkout/success/page.tsx
    - Display order confirmation with details
    - Clear cart on successful payment
    - _Requirements: 5.6_

  - [ ] 11.6 Handle payment errors
    - Create src/app/checkout/cancel/page.tsx
    - Display error message with retry option
    - _Requirements: 5.7_

- [ ] 12. Checkpoint - Ensure checkout works

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Create missing static pages

  - [ ] 13.1 Create About page

    - Create src/app/about/page.tsx
    - Add company story, mission, team info with Y2K aesthetic
    - _Requirements: 7.1_

  - [ ] 13.2 Create Contact page

    - Create src/app/contact/page.tsx
    - Implement contact form with name, email, message
    - Add form validation and submission handling
    - _Requirements: 7.2, 7.4_

  - [ ] 13.3 Create New Arrivals page

    - Create src/app/new-arrivals/page.tsx
    - Fetch products sorted by created_at descending
    - Use shared ProductCard and Layout components
    - _Requirements: 7.3, 7.5_

  - [ ] 13.4 Write property test for New Arrivals sorting
    - **Property 9: New Arrivals Sorted Correctly**
    - **Validates: Requirements 7.5**

- [ ] 14. Refactor existing pages to use shared components

  - [ ] 14.1 Update home page

    - Replace inline navigation and footer with Layout component
    - Replace inline product cards with ProductCard component
    - _Requirements: 2.6_

  - [ ] 14.2 Update cart page
    - Replace inline navigation with Layout component
    - Fix Tailwind class warnings
    - _Requirements: 2.6, 9.2_

- [ ] 15. Final checkpoint - Full integration test
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all pages render correctly
  - Test complete user flow: browse → add to cart → checkout

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout
- Testing framework: Vitest with fast-check for property-based testing
