#!/usr/bin/env python3
"""
CLI Study Companion for pNFS & pNFS-Lattice
Run directly or via `just cli`
"""

import sys
import time
import os

# Import dataset from server.py
try:
    from server import LEARNING_DATA
except ImportError:
    import json
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from server import LEARNING_DATA

# ANSI color codes for terminal styling
CYAN = "\033[96m"
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def clear_screen():
    print("\033[2J\033[H", end="")


def print_banner():
    clear_screen()
    print(f"""{CYAN}{BOLD}
╔══════════════════════════════════════════════════════════════════════════╗
║               pNFS & pNFS-LATTICE STUDY COMPANION                        ║
║        Scale-Out Metadata, Flex Files (RFC 8435) & RonDB Architecture    ║
╚══════════════════════════════════════════════════════════════════════════╝{RESET}
""")


def view_topics():
    while True:
        print_banner()
        print(f"{BOLD}SELECT A TOPIC TO STUDY:{RESET}\n")
        topics = LEARNING_DATA["topics"]
        for idx, t in enumerate(topics, 1):
            print(f"  {CYAN}{idx}.{RESET} {BOLD}{t['title']}{RESET}")
            print(f"     {DIM}{t['subtitle']}{RESET}")

        print(f"\n  {YELLOW}0.{RESET} Back to Main Menu")
        choice = input(f"\n{BOLD}Enter choice (0-{len(topics)}): {RESET}").strip()

        if choice == "0":
            break

        if choice.isdigit() and 1 <= int(choice) <= len(topics):
            selected = topics[int(choice) - 1]
            clear_screen()
            print(f"{CYAN}{BOLD}{'=' * 75}{RESET}")
            print(f"{BOLD}{selected['title']}{RESET}")
            print(f"{DIM}{selected['subtitle']}{RESET}")
            print(f"{CYAN}{'=' * 75}{RESET}\n")

            print(f"{YELLOW}{BOLD}Summary:{RESET} {selected['summary']}\n")
            print(f"{selected['content']}\n")

            print(f"{GREEN}{BOLD}Key Takeaways:{RESET}")
            for item in selected["key_takeaways"]:
                print(f"  ✓ {item}")

            input(f"\n{DIM}Press Enter to return to topic list...{RESET}")


def run_flashcards():
    cards = LEARNING_DATA["flashcards"]
    current = 0
    while True:
        clear_screen()
        card = cards[current]
        print(f"{BLUE}{BOLD}╔══════════════════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{BLUE}{BOLD}║                     pNFS-LATTICE FLASHCARD SYSTEM                        ║{RESET}")
        print(f"{BLUE}{BOLD}║                          Card {current + 1} of {len(cards)} [{card['category']}]                          ║{RESET}")
        print(f"{BLUE}{BOLD}╚══════════════════════════════════════════════════════════════════════════╝{RESET}\n")

        print(f"{BOLD}QUESTION / CONCEPT:{RESET}")
        print(f"  {YELLOW}{BOLD}{card['front']}{RESET}\n")

        input(f"{DIM}Press [Enter] to reveal the answer...{RESET}")
        print(f"\n{GREEN}{BOLD}ANSWER / ARCHITECTURE DETAIL:{RESET}")
        print(f"  {card['back']}\n")

        print(f"{DIM}{'-' * 70}{RESET}")
        action = input(f"[{BOLD}N{RESET}]ext card | [{BOLD}P{RESET}]revious | [{BOLD}Q{RESET}]uit to menu: ").strip().lower()

        if action == "q":
            break
        elif action == "p":
            current = (current - 1) % len(cards)
        else:
            current = (current + 1) % len(cards)


def run_quiz():
    clear_screen()
    print_banner()
    print(f"{GREEN}{BOLD}STARTING CERTIFICATION KNOWLEDGE QUIZ{RESET}")
    print(f"{DIM}Test your understanding of pNFS, Flex Files, RonDB & Lattice internals.{RESET}\n")

    quiz = LEARNING_DATA["quiz"]
    score = 0

    for idx, q in enumerate(quiz, 1):
        print(f"\n{CYAN}{BOLD}Question {idx}/{len(quiz)}:{RESET} {BOLD}{q['question']}{RESET}\n")
        for o_idx, opt in enumerate(q["options"]):
            print(f"  {CYAN}{chr(65 + o_idx)}){RESET} {opt}")

        user_ans = ""
        while user_ans not in ["a", "b", "c", "d"]:
            user_ans = input(f"\nYour answer (A-D): ").strip().lower()

        chosen_idx = ord(user_ans) - ord('a')
        if chosen_idx == q["correct"]:
            print(f"{GREEN}{BOLD} Correct!{RESET}")
            score += 1
        else:
            correct_letter = chr(65 + q["correct"])
            print(f"{RED}{BOLD} Incorrect.{RESET} The correct answer is {BOLD}{correct_letter}{RESET}.")

        print(f"{DIM}Explanation: {q['explanation']}{RESET}")
        time.sleep(1)

    # Final tally
    percentage = (score / len(quiz)) * 100
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{BOLD}QUIZ COMPLETED!{RESET}")
    print(f"Final Score: {BOLD}{score}/{len(quiz)}{RESET} ({percentage:.1f}%)")

    if percentage >= 80:
        print(f"{GREEN}{BOLD} Outstanding! You have mastered pNFS-Lattice core architecture.{RESET}")
    elif percentage >= 60:
        print(f"{YELLOW}{BOLD} Good job! Review the flashcards to reinforce memory details.{RESET}")
    else:
        print(f"{RED}{BOLD} Keep studying! Check Topic 4 & 5 to review RonDB and MDS scaling.{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}")

    input(f"\n{DIM}Press Enter to return to main menu...{RESET}")


def view_cluster_simulator():
    clear_screen()
    print_banner()
    print(f"{BOLD}PNFS-LATTICE VS TRADITIONAL CLUSTER SIMULATION{RESET}\n")

    print(f"Simulating an AI Training Cluster with {BOLD}1,000 Compute / GPU Clients{RESET}:")
    print(f"{DIM}Workload: Checkpointing & DataLoader small-file opening storm{RESET}\n")

    print(f"{RED}{BOLD}1. Traditional NFS (Single Server):{RESET}")
    print("   • Architecture: 1 monolithic NFSv3/v4 server handling data + metadata")
    print("   • Metadata IOPS Limit: ~25,000 - 35,000 IOPS")
    print("   • Data Bandwidth: Saturated at ~4 - 5 GB/s (100GbE line limit)")
    print(f"   • Status: {RED}SEVERE CRITICAL BOTTLENECK. 1,000 clients stall.{RESET}\n")

    print(f"{YELLOW}{BOLD}2. Traditional pNFS (RFC 5661 with 16 Data Servers):{RESET}")
    print("   • Architecture: 1 static MDS (active-passive) + 16 knfsd Data Servers")
    print("   • Metadata IOPS Limit: ~65,000 IOPS (MDS CPU & lock ceiling)")
    print("   • Data Bandwidth: ~100 GB/s across 16 DSes (linear data scale)")
    print(f"   • Status: {YELLOW}METADATA SATURATION. Data path is fast, but open/close queues block.{RESET}\n")

    print(f"{GREEN}{BOLD}3. pNFS-Lattice (8 Active-Active MDS + RonDB + 16 DSes):{RESET}")
    print("   • Architecture: 8 user-space lattice-pnfs daemons + RonDB in-memory cluster + 16 DSes")
    print("   • Metadata IOPS: ~760,000+ IOPS (scales dynamically with MDS fleet)")
    print("   • Data Bandwidth: ~192 GB/s (RDMA Flex Files layout direct to knfsd)")
    print("   • Parent Directory Locks: Atomic RonDB interpretedUpdateTuple (no DLM stall)")
    print(f"   • Status: {GREEN}ZERO BOTTLENECK. Sub-millisecond latency under 1,000 clients.{RESET}\n")

    input(f"{DIM}Press Enter to return to main menu...{RESET}")


def main():
    while True:
        print_banner()
        print(f"{BOLD}MAIN MENU:{RESET}")
        print(f"  {CYAN}1.{RESET} {BOLD}Study Modules & Technical Deep-Dive{RESET}")
        print(f"  {CYAN}2.{RESET} {BOLD}Interactive Flashcards (10 Cards){RESET}")
        print(f"  {CYAN}3.{RESET} {BOLD}Take Knowledge Certification Quiz{RESET}")
        print(f"  {CYAN}4.{RESET} {BOLD}Run Architecture Scaling Comparison{RESET}")
        print(f"  {CYAN}5.{RESET} {BOLD}Launch Web Study App{RESET}")
        print(f"  {CYAN}0.{RESET} Exit\n")

        choice = input(f"{BOLD}Select option (0-5): {RESET}").strip()

        if choice == "1":
            view_topics()
        elif choice == "2":
            run_flashcards()
        elif choice == "3":
            run_quiz()
        elif choice == "4":
            view_cluster_simulator()
        elif choice == "5":
            print(f"\n{GREEN}Starting Web App on http://localhost:8080 ...{RESET}")
            print(f"You can also run `{BOLD}just run{RESET}` at any time.")
            time.sleep(1)
            from server import run as run_server
            run_server(8080)
        elif choice == "0":
            print(f"\n{CYAN}Happy studying! Good luck with pNFS and Lattice!{RESET}\n")
            break


if __name__ == "__main__":
    main()
