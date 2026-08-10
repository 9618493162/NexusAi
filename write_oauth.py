#!/usr/bin/env python3
"""
OAuth Environment Setup Script for NexusAI
Generates .env entries for Google & GitHub OAuth
"""

import secrets
import os


def generate_jwt_secret():
    """Generate a cryptographically secure JWT secret."""
    return secrets.token_urlsafe(32)


def main():
    print("# Add these to your backend/.env file:\n")

    print(f"JWT_SECRET={generate_jwt_secret()}")
    print(f"JWT_REFRESH_SECRET={generate_jwt_secret()}")
    print("GOOGLE_CLIENT_ID=your_google_client_id_here")
    print("GOOGLE_CLIENT_SECRET=your_google_client_secret_here")
    print("GITHUB_CLIENT_ID=your_github_client_id_here")
    print("GITHUB_CLIENT_SECRET=your_github_client_secret_here")
    print("SESSION_SECRET=" + generate_jwt_secret())

    print("\n# Frontend .env:")
    print("VITE_GOOGLE_CLIENT_ID=your_google_client_id_here")
    print("VITE_GITHUB_CLIENT_ID=your_github_client_id_here")

    print("\n# ---")
    print("# Get Google OAuth credentials: https://console.cloud.google.com/apis/credentials")
    print("# Get GitHub OAuth credentials: https://github.com/settings/developers")
    print("# Run: python write_oauth.py >> backend/.env")


if __name__ == "__main__":
    main()
