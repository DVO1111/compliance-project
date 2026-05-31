/*
  # Add INSERT policy to profiles table

  1. Security Changes
    - Add INSERT policy on `profiles` table so authenticated users can create their own profile row
    - This fixes a bug where new user signups fail to create a profile due to missing INSERT policy
    - The policy ensures users can only insert a row where the id matches their own auth.uid()

  2. Notes
    - The existing SELECT and UPDATE policies remain unchanged
    - Without this policy, the signUp function in AuthContext cannot insert the user's profile
*/

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
