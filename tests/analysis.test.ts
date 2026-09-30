import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSolution,
  stripCommentsAndStrings,
  stripSyncHeader,
} from '../src/utils/analysis.ts';

const JAVA_REPLACE_BRUTE = `
class Solution {
    public int[] replaceElements(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            int max = -1;
            for (int j = i + 1; j < arr.length; j++) {
                max = Math.max(max, arr[j]);
            }
            arr[i] = max;
        }
        return arr;
    }
}`;

const JAVA_REPLACE_OPTIMAL = `
class Solution {
    public int[] replaceElements(int[] arr) {
        int max = -1;
        for (int i = arr.length - 1; i >= 0; i--) {
            int cur = arr[i];
            arr[i] = max;
            max = Math.max(max, cur);
        }
        return arr;
    }
}`;

const PY_TWO_SUM_BRUTE = `
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        n = len(nums)
        for i in range(n):
            for j in range(i + 1, n):
                if nums[i] + nums[j] == target:
                    return [i, j]
        return []
`;

const PY_TWO_SUM_HASH = `
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:  # complement lookup
                return [seen[target - x], i]
            seen[x] = i
        return []
`;

test('Replace Elements: brute force vs optimal (Java)', () => {
  const brute = analyzeSolution(JAVA_REPLACE_BRUTE, 'java');
  assert.equal(brute.timeComplexity, 'O(n²)');
  assert.equal(brute.spaceComplexity, 'O(1)');
  assert.equal(brute.pattern, 'Nested loops');
  assert.equal(brute.style, 'iterative');

  const optimal = analyzeSolution(JAVA_REPLACE_OPTIMAL, 'java');
  assert.equal(optimal.timeComplexity, 'O(n)');
  assert.equal(optimal.spaceComplexity, 'O(1)');
  assert.equal(optimal.pattern, 'Reverse traversal');
});

test('Two Sum: brute force vs hash map (Python)', () => {
  const brute = analyzeSolution(PY_TWO_SUM_BRUTE, 'python3');
  assert.equal(brute.timeComplexity, 'O(n²)');
  assert.equal(brute.spaceComplexity, 'O(1)');

  const hash = analyzeSolution(PY_TWO_SUM_HASH, 'python3');
  assert.equal(hash.timeComplexity, 'O(n)');
  assert.equal(hash.spaceComplexity, 'O(n)');
  assert.equal(hash.pattern, 'Hash map');
});

test('Python reverse range and two-arg max stay O(n) / O(1)', () => {
  const code = `
class Solution:
    def replaceElements(self, arr: List[int]) -> List[int]:
        mx = -1
        for i in range(len(arr) - 1, -1, -1):
            arr[i], mx = mx, max(mx, arr[i])
        return arr
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, 'O(n)');
  assert.equal(r.spaceComplexity, 'O(1)');
  assert.equal(r.pattern, 'Reverse traversal');
});

test('binary search is O(log n)', () => {
  const code = `
class Solution {
public:
    int search(vector<int>& nums, int target) {
        int lo = 0, hi = nums.size() - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) lo = mid + 1; else hi = mid - 1;
        }
        return -1;
    }
};`;
  const r = analyzeSolution(code, 'cpp');
  assert.equal(r.timeComplexity, 'O(log n)');
  assert.equal(r.spaceComplexity, 'O(1)');
  assert.equal(r.pattern, 'Binary search');
});

test('sorting dominates a linear scan: O(n log n)', () => {
  const code = `
var twoSumSorted = function(nums, target) {
    nums.sort((a, b) => a - b);
    let left = 0, right = nums.length - 1;
    while (left < right) {
        const s = nums[left] + nums[right];
        if (s === target) return true;
        if (s < target) left++; else right--;
    }
    return false;
};`;
  const r = analyzeSolution(code, 'javascript');
  assert.equal(r.timeComplexity, 'O(n log n)');
  assert.match(r.pattern ?? '', /Two pointers/);
});

test('grid traversal over different dimensions is O(m·n)', () => {
  const code = `
class Solution:
    def countNegatives(self, grid: List[List[int]]) -> int:
        count = 0
        for i in range(len(grid)):
            for j in range(len(grid[0])):
                if grid[i][j] < 0:
                    count += 1
        return count
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, 'O(m·n)');
  assert.equal(r.spaceComplexity, 'O(1)');
});

test('constant inner loops (26 letters, 4 directions) do not add a factor', () => {
  const code = `
class Solution {
    public boolean isAnagram(String s, String t) {
        int[] count = new int[26];
        for (int i = 0; i < s.length(); i++) count[s.charAt(i) - 'a']++;
        for (int i = 0; i < t.length(); i++) count[t.charAt(i) - 'a']--;
        for (int i = 0; i < 26; i++) if (count[i] != 0) return false;
        return true;
    }
}`;
  const r = analyzeSolution(code, 'java');
  assert.equal(r.timeComplexity, 'O(n)');
  assert.equal(r.spaceComplexity, 'O(1)');
});

test('sliding window (inner while) leaves time unset instead of claiming O(n²)', () => {
  const code = `
class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        seen = set()
        left = best = 0
        for right in range(len(s)):
            while s[right] in seen:
                seen.remove(s[left])
                left += 1
            seen.add(s[right])
            best = max(best, right - left + 1)
        return best
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, undefined);
  assert.equal(r.spaceComplexity, 'O(n)');
  assert.match(r.pattern ?? '', /Sliding window/);
});

test('monotonic stack is not misreported as quadratic', () => {
  const code = `
class Solution:
    def dailyTemperatures(self, temperatures: List[int]) -> List[int]:
        res = [0] * len(temperatures)
        stack = []
        for i, t in enumerate(temperatures):
            while stack and temperatures[stack[-1]] < t:
                j = stack.pop()
                res[j] = i - j
            stack.append(i)
        return res
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, undefined);
  assert.equal(r.pattern, 'Monotonic stack');
});

test('recursion leaves complexity unset but reports style and pattern', () => {
  const code = `
class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }
}`;
  const r = analyzeSolution(code, 'java');
  assert.equal(r.timeComplexity, undefined);
  assert.equal(r.spaceComplexity, undefined);
  assert.equal(r.style, 'recursive');
  assert.equal(r.pattern, 'DFS');
});

test('memoized recursion is tagged as memoization', () => {
  const code = `
class Solution:
    def climbStairs(self, n: int) -> int:
        @cache
        def go(i):
            if i <= 1:
                return 1
            return go(i - 1) + go(i - 2)
        return go(n)
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.style, 'recursive');
  assert.match(r.pattern ?? '', /Memoization/);
  assert.equal(r.timeComplexity, undefined);
});

test('heap usage leaves time unset', () => {
  const code = `
class Solution:
    def findKthLargest(self, nums: List[int], k: int) -> int:
        heap = []
        for x in nums:
            heapq.heappush(heap, x)
            if len(heap) > k:
                heapq.heappop(heap)
        return heap[0]
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, undefined);
  assert.equal(r.pattern, 'Heap');
});

test('BFS work-list loop with nested neighbours is left unset', () => {
  const code = `
class Solution:
    def numIslands(self, grid):
        q = deque()
        q.append((0, 0))
        while q:
            r, c = q.popleft()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                for k in range(len(grid)):
                    pass
        return 0
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, undefined);
  assert.match(r.pattern ?? '', /BFS/);
});

test('list membership inside a loop is quadratic; unknown receiver is unset', () => {
  const quadratic = `
class Solution:
    def containsDuplicate(self, nums: List[int]) -> bool:
        seen = []
        for x in nums:
            if x in seen:
                return True
            seen.append(x)
        return False
`;
  // `seen` is a list but the loop iterates `nums`: different collections,
  // so the analyzer refuses to guess.
  assert.equal(analyzeSolution(quadratic, 'python3').timeComplexity, undefined);

  const indexInLoop = `
class Solution:
    def f(self, nums):
        out = 0
        for x in nums:
            out += nums.index(x)
        return out
`;
  assert.equal(analyzeSolution(indexInLoop, 'python3').timeComplexity, 'O(n²)');
});

test('digit loop is logarithmic', () => {
  const code = `
func reverse(x int) int {
    res := 0
    for x != 0 {
        res = res*10 + x%10
        x /= 10
    }
    return res
}`;
  const r = analyzeSolution(code, 'golang');
  assert.equal(r.timeComplexity, 'O(log n)');
  assert.equal(r.spaceComplexity, 'O(1)');
});

test('a helper named like a library call is not a library scan', () => {
  const cpp = `
class Solution {
public:
    void reverse(vector<int>& a, int l, int r) {
        while (l < r) swap(a[l++], a[r--]);
    }
    int f(int x) { return x + 1; }
};`;
  const r = analyzeSolution(cpp, 'cpp');
  assert.equal(r.timeComplexity, 'O(n)');
});

test('no loops and no library scans is O(1)', () => {
  const code = `
class Solution:
    def isPowerOfTwo(self, n: int) -> bool:
        return n > 0 and n & (n - 1) == 0
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, 'O(1)');
  assert.equal(r.spaceComplexity, 'O(1)');
});

test('builtin scans at top level are linear', () => {
  const code = `
class Solution:
    def containsDuplicate(self, nums: List[int]) -> bool:
        return len(set(nums)) != len(nums)
`;
  const r = analyzeSolution(code, 'python3');
  assert.equal(r.timeComplexity, 'O(n)');
  assert.equal(r.spaceComplexity, 'O(n)');
});

test('helper with a loop called inside a loop is unset', () => {
  const code = `
class Solution:
    def countPrimes(self, nums):
        def is_prime(x):
            i = 2
            while i * i <= x:
                if x % i == 0:
                    return False
                i += 1
            return True
        return sum(1 for x in nums if is_prime(x))
`;
  assert.equal(analyzeSolution(code, 'python3').timeComplexity, undefined);
});

test('C++ method signatures are not counted as allocations', () => {
  const code = `
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        for (int i = 0; i < nums.size(); i++)
            for (int j = i + 1; j < nums.size(); j++)
                if (nums[i] + nums[j] == target) return {i, j};
        return {};
    }
};`;
  const r = analyzeSolution(code, 'cpp');
  assert.equal(r.timeComplexity, 'O(n²)');
  assert.equal(r.spaceComplexity, 'O(1)');
});

test('comments and strings cannot fake loops', () => {
  const code = `
class Solution {
    // for (int i = 0; i < n; i++) for (int j = 0; j < n; j++)
    public String f(String s) {
        String msg = "for while for while";
        /* while (true) { for (;;) {} } */
        return msg;
    }
}`;
  const r = analyzeSolution(code, 'java');
  assert.equal(r.timeComplexity, 'O(1)');
});

test('unsupported languages return no complexity', () => {
  const r = analyzeSolution('SELECT * FROM Person;', 'mysql');
  assert.equal(r.timeComplexity, undefined);
  assert.equal(r.spaceComplexity, undefined);
  assert.equal(r.version, 1);
});

test('Kotlin / Rust / Swift ranges are understood', () => {
  const kotlin = `
class Solution {
    fun f(nums: IntArray): Int {
        var s = 0
        for (i in nums.size - 1 downTo 0) s += nums[i]
        return s
    }
}`;
  const k = analyzeSolution(kotlin, 'kotlin');
  assert.equal(k.timeComplexity, 'O(n)');
  assert.equal(k.pattern, 'Reverse traversal');

  const rust = `
impl Solution {
    pub fn f(nums: Vec<i32>) -> i32 {
        let n = nums.len();
        let mut best = 0;
        for i in 0..n {
            for j in (i + 1)..n {
                best = best.max(nums[i] + nums[j]);
            }
        }
        best
    }
}`;
  assert.equal(analyzeSolution(rust, 'rust').timeComplexity, 'O(n²)');
});

test('stripCommentsAndStrings keeps line structure for Python', () => {
  const code = 'x = 1  # comment\ns = """doc\nstring"""\ny = "a#b"\n';
  const out = stripCommentsAndStrings(code, 'python');
  assert.equal(out.split('\n').length, code.split('\n').length);
  assert.ok(!out.includes('comment'));
  assert.ok(!out.includes('a#b'));
});

test('stripSyncHeader removes the include-notes header only', () => {
  const withHeader = '# 1. Two Sum [Easy]\n# https://x\n# Language: python3\n\nclass Solution:\n    pass\n';
  assert.equal(stripSyncHeader(withHeader), 'class Solution:\n    pass\n');
  const plain = '# just a comment\nclass Solution:\n    pass\n';
  assert.equal(stripSyncHeader(plain), plain);
});
