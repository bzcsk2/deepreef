// TODO: Fix all type errors in this file

function greet(name: string): string {
  return `Hello, ${name}!`;
}

function add(a: number, b: number): number {
  return a + b;
}

function getLength(value: string): number {
  return value.length;
}

// --- BUGS BELOW ---

// Bug 1: Wrong return type
function getAge(): string {
  return 25;
}

// Bug 2: Missing property access
interface User {
  id: number;
  name: string;
  email: string;
}

function formatUser(user: User): string {
  return `${user.name} <${user.mail}>`;
}

// Bug 3: Array type mismatch
function sumEven(numbers: number[]): number {
  return numbers
    .filter((n) => n % 2 === 0)
    .reduce((acc, n) => acc + n, "0");
}

// Bug 4: Null check missing
function getFirstChar(str: string | null): string {
  return str.charAt(0);
}

export { greet, add, getLength, getAge, formatUser, sumEven, getFirstChar };
