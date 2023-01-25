/**
 * Jest is failing to run because it cannot load the module 'obsidian' in 'main.ts'
 * https://github.com/obsidianmd/obsidian-api/issues/13
 */

import {
	calculateRemainingIncompleteTodos,
	filterOutExistingTodos,
	insertIncompleteTodos,
	parseForTodos,
	parseTextForTodos,
	todoHasIncompleteItem,
	TodoNode,
	todosToString
} from "../src/todo";
import * as fs from "fs";
import * as path from "path";

const allowedChars = new Set([" ", "x", "X", "/", "-", "?"]);
const completeChars = new Set(["x", "X", "-"]);

describe('todoHasIncompleteItem checks', () => {
    it('top level incomplete todo returns true', () => {
        // Given
        const node = {
            item: "item",
            state: " ",
            complete: false,
            children: []
        }

        // When
        const result = todoHasIncompleteItem(node)

        // Then
        expect(result).toBeTruthy()
    });

    it('top level complete todo returns false', () => {
        // Given
        const node = {
            item: "item",
            state: "x",
            complete: true,
            children: [],
        }

        // When
        const result = todoHasIncompleteItem(node)

        // Then
        expect(result).toBeFalsy()
    });

    it('nested incomplete todo returns true', () => {
        // Given
        const node: TodoNode = {
            item: "item",
            state: "x",
            complete: true,
            children: [
                {
                    item: "item2",
                    state: "x",
                    complete: true,
                    children: [
                        {
                            item: "item3",
                            state: " ",
                            complete: false,
                            children: [],
                        }
                    ]
                }
            ],
        }

        // When
        const result = todoHasIncompleteItem(node)

        // Then
        expect(result).toBeTruthy()
    });

    it('nested complete todos returns true', () => {
        // Given
        const node: TodoNode = {
            item: "item",
            state: "x",
            complete: true,
            children: [
                {
                    item: "item2",
                    state: "x",
                    complete: true,
                    children: [
                        {
                            item: "item3",
                            state: "x",
                            complete: true,
                            children: [],
                        }
                    ]
                }
            ],
        }

        // When
        const result = todoHasIncompleteItem(node)

        // Then
        expect(result).toBeFalsy()
    });
});

describe('parseForTodos returns expected Todo', () => {
    it.each([
        "garbage",
        "garbage - [ ] todo",
        "-- [ ]",
        "- []",
        "[ ]",
    ])('returns null for non-Todo line', (line) => {
        // When
        const result = parseForTodos(allowedChars, completeChars, [line], 0);

        // Then
        expect(result.todo).toBeNull();
        expect(result.numItems).toBe(0);
    });

    it.each(Array.from(completeChars))('returns single complete TodoNode for all completeChars', (content) => {
        // Given
        const lines = [
            `- [${content}] item 1`,
        ]

        // When
        const result = parseForTodos(allowedChars, completeChars, lines, 0);

        // Then
        expect(result.todo).toMatchObject({
            item: "item 1",
            state: content,
            complete: true,
            children: []
        })
    });

    it('returns single incomplete TodoNode for single incomplete item', () => {
        // Given
        const lines = [
            "- [ ] item 1",
        ]

        // When
        const result = parseForTodos(allowedChars, completeChars, lines, 0);

        // Then
        expect(result.todo).toMatchObject({
            item: "item 1",
            complete: false,
            children: []
        })
    });

    it('returns nested todos with correct state', () => {
        // Given
        const lines = [
            '- [x] item 1',
            '  - [ ] item 2',
            '    - [x] item 3',
            '      - [ ] item 4',
            '      - [x] item 5',
            '- [ ] another same level todo'
        ]

        // When
        const result = parseForTodos(allowedChars, completeChars, lines, 0);

        // Then
        expect(result.todo).toMatchObject({
            item: "item 1",
            complete: true,
            children: [
                {
                    item: "item 2",
                    complete: false,
                    children: [
                        {
                            item: "item 3",
                            complete: true,
                            children: [
                                {
                                    item: "item 4",
                                    complete: false,
                                    children: []
                                },
                                {
                                    item: "item 5",
                                    complete: true,
                                    children: []
                                }
                            ]
                        }
                    ]
                }
            ]
        })
        expect(result.numItems).toBe(5);
    });

});

describe('calculateRemainingIncompleteTodos', () => {
    it('identical todo on multiple days only appears once', () => {
        // Given
        const todos: Map<string, TodoNode[]>[] = [
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: []
            }]]]),
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: []
            }]]]),
        ]

        // When
        const incompleteTodos = calculateRemainingIncompleteTodos(todos);

        // Then
        const expected = new Map<string, TodoNode[]>([
            ["untitled", [{item: "item 1", state: " ", complete: false, children: []}]]
        ])
        expect(incompleteTodos).toMatchObject(expected)
    });

    it('incomplete todo that appears on multiple days with different children is replaced by latest', () => {
        // Given
        const todos: Map<string, TodoNode[]>[] = [
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: []
            }]]]),
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: [
                    {
                        item: "new nested item",
                        state: "x",
                        complete: true,
                        children: []
                    }
                ]
            }]]])
        ]

        // When
        const incompleteTodos = calculateRemainingIncompleteTodos(todos);

        // Then
        const expected = new Map<string, TodoNode[]>([
            ["untitled", [{
                item: "item 1", state: " ", complete: false, children: [
                    {
                        item: "new nested item",
                        state: "x",
                        complete: true,
                        children: []
                    }
                ]
            }]]
        ])
        expect(incompleteTodos).toMatchObject(expected)
    });

    it('incomplete Todo complete on later day is removed', () => {
        // Given
        const todos: Map<string, TodoNode[]>[] = [
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: []
            }]]]),
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: "x",
                complete: true,
                // Even if the nested items are different
                children: [
                    {
                        item: "new nested item",
                        state: "x",
                        complete: true,
                        children: []
                    }
                ]
            }]]])
        ]

        // When
        const incompleteTodos = calculateRemainingIncompleteTodos(todos);

        // Then
        expect(incompleteTodos).toMatchObject(new Map<string, TodoNode[]>([["untitled", []]]))

    });

    it('todo that has incomplete, complete, incomplete days is re-added', () => {
        // Given
        const todos: Map<string, TodoNode[]>[] = [
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: []
            }]]]),
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: "x",
                complete: true,
                children: []
            }]]]),
            new Map<string, TodoNode[]>([["untitled", [{
                item: "item 1",
                state: " ",
                complete: false,
                children: []
            }]]])
        ]

        // // When
        const incompleteTodos = calculateRemainingIncompleteTodos(todos);

        // Then
        const expected = new Map<string, TodoNode[]>([
            ["untitled", [{item: "item 1", state: " ", complete: false, children: []}]]
        ])
        expect(incompleteTodos).toMatchObject(expected);
    });

});

describe('todoToTextRepresentation', () => {
    it('top-level todos', () => {
        // Given
        const todo = {
            item: "item 1",
            state: " ",
            complete: false,
            children: []
        }

        // When
        const result = todosToString([todo]);

        // Then
        expect(result).toBe("- [ ] item 1");
    });

    it('nested todo', () => {
        // Given
        const todo = {
            item: "item 1",
            state: " ",
            complete: false,
            children: [
                {
                    item: "item 2",
                    state: "x",
                    complete: true,
                    children: [
                        {
                            item: "item 3",
                            state: "x",
                            complete: true,
                            children: []
                        },
                        {
                            item: "item 4",
                            state: " ",
                            complete: false,
                            children: []
                        }
                    ]
                }
            ]
        }

        // When
        const result = todosToString([todo]);

        // Then
        expect(result).toBe(
            `- [ ] item 1
\t- [x] item 2
\t\t- [x] item 3
\t\t- [ ] item 4`
        );
    });
});

describe('insertTodos', () => {
    it('new text contains provided todos', () => {
        // Given
        const todos: Map<string, TodoNode[]> = new Map<string, TodoNode[]>([
            ["untitled",
                [
                    {
                        item: "item 1",
                        state: " ",
                        complete: false,
                        children: []
                    },
                    {
                        item: "item 2",
                        state: "x",
                        complete: true,
                        children: [
                            {
                                item: "item 3",
                                state: " ",
                                complete: false,
                                children: []
                            },
                            {
                                item: "item 4",
                                state: "x",
                                complete: true,
                                children: []
                            }
                        ]
                    },
                    {
                        item: "item 5",
                        state: " ",
                        complete: false,
                        children: []
                    }
                ]
            ]])
        const initialNoteText = `beginning
more text
`;

        // When
        const newNoteText = insertIncompleteTodos(todos, true, initialNoteText);

        // Then
        expect(newNoteText).toBe(`beginning
more text

- [ ] item 1
- [x] item 2
\t- [ ] item 3
\t- [x] item 4
- [ ] item 5`);
    })

    it('When groupBySection, todos are added to matching sections', () => {
        // Given
        const todos: Map<string, TodoNode[]> = new Map<string, TodoNode[]>([
            ["## work",
                [
                    {
                        item: "work item",
                        state: " ",
                        complete: false,
                        children: []
                    }

                ]
            ],
            [
                "## personal",
                [
                    {
                        item: "personal item",
                        state: " ",
                        complete: false,
                        children: []
                    }
                ]
            ]
        ])
        const initialNoteText = `beginning
## work

## personal

more text
`;

        // When
        const newNoteText = insertIncompleteTodos(todos, true, initialNoteText);

        // Then
        expect(newNoteText).toBe(`beginning
## work
- [ ] work item

## personal
- [ ] personal item

more text
`);
    });
});

describe('golden examples', () => {
    test.each([
        ['SampleWithMultipleSectionHeaders', true],
        ['SampleWithExistingTodos', true],
        ['SampleWithSupportedTodoStates', true],
    ])('Produces expected output for %s', (sampleDir: string, bySection: boolean) => {
        // Given
        const previousNoteText = fs.readFileSync(path.join(__dirname, sampleDir, 'previousDay.input'), 'utf8');
        const newNoteInitialText = fs.readFileSync(path.join(__dirname, sampleDir, 'newDay.input'), 'utf8');

        // When
        const previousTodos = parseTextForTodos(previousNoteText, bySection, allowedChars, completeChars);
        const incompleteTodos = calculateRemainingIncompleteTodos([previousTodos]);
        const existingTodos = parseTextForTodos(newNoteInitialText, bySection, allowedChars, completeChars)
        const missingIncompleteTodos = filterOutExistingTodos(incompleteTodos, existingTodos)
        const result = insertIncompleteTodos(missingIncompleteTodos, bySection, newNoteInitialText);

        // Then
        const expectedNewDayText = fs.readFileSync(path.join(__dirname, sampleDir, 'newDay.output'), 'utf8');
        expect(result).toBe(expectedNewDayText)
    });
});
