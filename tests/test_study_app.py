"""
Unit tests for pNFS & pNFS-Lattice Study App
"""

import unittest
import json
import os
import sys

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import LEARNING_DATA, StudyAppHandler


class TestStudyAppData(unittest.TestCase):
    def test_learning_data_structure(self):
        """Verify topics, flashcards, and quiz questions exist and have proper fields."""
        self.assertIn("topics", LEARNING_DATA)
        self.assertIn("flashcards", LEARNING_DATA)
        self.assertIn("quiz", LEARNING_DATA)

        # Check topics
        self.assertGreaterEqual(len(LEARNING_DATA["topics"]), 5)
        for topic in LEARNING_DATA["topics"]:
            self.assertIn("id", topic)
            self.assertIn("title", topic)
            self.assertIn("summary", topic)
            self.assertIn("content", topic)
            self.assertIn("key_takeaways", topic)

        # Check flashcards
        self.assertGreaterEqual(len(LEARNING_DATA["flashcards"]), 8)
        for card in LEARNING_DATA["flashcards"]:
            self.assertIn("id", card)
            self.assertIn("front", card)
            self.assertIn("back", card)
            self.assertIn("category", card)

        # Check quiz
        self.assertGreaterEqual(len(LEARNING_DATA["quiz"]), 6)
        for q in LEARNING_DATA["quiz"]:
            self.assertIn("id", q)
            self.assertIn("question", q)
            self.assertIn("options", q)
            self.assertIn("correct", q)
            self.assertIn("explanation", q)
            self.assertGreaterEqual(len(q["options"]), 3)
            self.assertTrue(0 <= q["correct"] < len(q["options"]))

    def test_static_files_exist(self):
        """Ensure all required static web assets exist."""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        static_dir = os.path.join(base_dir, "static")
        self.assertTrue(os.path.exists(os.path.join(static_dir, "index.html")))
        self.assertTrue(os.path.exists(os.path.join(static_dir, "style.css")))
        self.assertTrue(os.path.exists(os.path.join(static_dir, "app.js")))


if __name__ == "__main__":
    unittest.main()
