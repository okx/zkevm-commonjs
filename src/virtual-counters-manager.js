/* eslint-disable no-restricted-globals */
/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
/* eslint-disable prefer-destructuring */
const constants = require('./constants');
const virtualCountersFile = require('./virtual-counters.json');

const vsConstants = Object.keys(virtualCountersFile.constants);
const totalSteps = virtualCountersFile.constants.TOTAL_STEPS;

module.exports = class VirtualCountersManager {
    constructor(verbose = false) {
        this.verbose = verbose;
        // Compute counter initial amounts
        this.currentCounters = {
            S: {
                amount: totalSteps,
                name: 'steps',
                initAmount: totalSteps,
            },
            A: {
                amount: constants.MAX_CNT_ARITH_LIMIT,
                name: 'arith',
                initAmount: constants.MAX_CNT_ARITH_LIMIT,
            },
            B: {
                amount: constants.MAX_CNT_BINARY_LIMIT,
                name: 'binary',
                initAmount: constants.MAX_CNT_BINARY_LIMIT,
            },
            M: {
                amount: constants.MAX_CNT_MEM_ALIGN_LIMIT,
                name: 'mem align',
                initAmount: constants.MAX_CNT_MEM_ALIGN_LIMIT,
            },
            K: {
                amount: constants.MAX_CNT_KECCAK_F_LIMIT,
                name: 'keccaks',
                initAmount: constants.MAX_CNT_KECCAK_F_LIMIT,
            },
            D: {
                amount: constants.MAX_CNT_PADDING_PG_LIMIT,
                name: 'padding',
                initAmount: constants.MAX_CNT_PADDING_PG_LIMIT,
            },
            P: {
                amount: constants.MAX_CNT_POSEIDON_G_LIMIT,
                name: 'poseidon',
                initAmount: constants.MAX_CNT_POSEIDON_G_LIMIT,
            },
        };
    }

    computeFunctionCounters(functionName, inputsObject = {}, iterations = 1) {
        if (isNaN(iterations)) this._throwError(`Invalid iterations value: ${iterations}`);
        const func = virtualCountersFile.functions[functionName];
        if (!func) this._throwError(`Function ${functionName} is not defined`);
        const { formula, inputs } = func;
        this._checkInputs(inputsObject, inputs);
        if (!formula) this._throwError(`Formula ${formula} from ${functionName} is not defined`);
        for (let i = 0; i < iterations; i++) { this._parseFormula(formula, inputsObject); }
    }

    _checkInputs(inputsObject, inputs = []) {
        inputs.forEach((input) => {
            if (!Object.keys(inputsObject).includes(input) || isNaN(inputsObject[input])) {
                this._throwError(`Missing or invalid input ${input}`);
            }
        });
    }

    _parseFormula(formula, inputsObject) {
    // Remove all spaces
        formula = formula.replace(/\s/g, '');
        // Split by +
        const formulaArray = formula.split('+');
        // Iterate over each element
        formulaArray.forEach((element) => {
            this._verbose(`Parsing formula element ${element}`);
            this._parseFormulaElement(element, inputsObject);
        });
    }

    _parseFormulaElement(element, inputsObject) {
        // Check if element is an input variable * counter (ex: txRLPLength/56D)
        if (Object.keys(inputsObject).includes(element.split('/')[0]) || Object.keys(inputsObject).includes(element.split('*')[0])) {
            this._parseInputCounter(element, inputsObject);

            return;
        }
        // Check if element is a function
        if (virtualCountersFile.functions[element.split('*')[0]]) {
            let iterations = element.split('*')[1];
            // Check if iterations is an input
            if (iterations && (Object.keys(inputsObject).includes(iterations.split('*')[0]) || Object.keys(inputsObject).includes(iterations.split('/')[0]))) {
                iterations = this._inputToConstant(iterations, inputsObject);
            }
            this.computeFunctionCounters(element.split('*')[0], inputsObject, iterations);

            return;
        }
        // Check if element is a constant
        if (vsConstants.includes(element) || vsConstants.includes(element.split('*')[1])) {
            this._parseConstans(element);

            return;
        }
        // Check if element is a simple counter reduction. If the format is Number + CounterType (ex: 100S)
        if (/^[0-9]*$/.test(element.slice(0, -1))) {
            const amount = element.slice(0, -1) === '' ? 1 : element.slice(0, -1);
            this._reduceCounters(amount, element.slice(-1));

            return;
        }

        throw new Error(`Invalid formula element ${element}`);
    }

    _parseInputCounter(element, inputsObject) {
        const counterSymbol = element.slice(-1);
        let constant = element.slice(0, -1);
        if (constant.includes('/') && !constant.includes('*')) {
        // The input is divided and rounded up
            constant = Math.ceil(inputsObject[constant.split('/')[0]] / constant.split('/')[1]);
        } else if (constant.includes('*') && !constant.includes('/')) {
            constant = inputsObject[constant.split('*')[0]] * constant.split('*')[1];
            // If the element has a third element, it means that it conatins a input*constant*function situation. We have to call constant*function where constant = input*constant
            if (element.split('*')[2]) {
                this.computeFunctionCounters(element.split('*')[2], inputsObject, constant);

                return;
            }
        } else if (constant.includes('*') && constant.includes('/')) {
            console.log('A');
        }
        this._reduceCounters(constant, counterSymbol);
    }

    _inputToConstant(element, inputsObject) {
        if (element.includes('/')) {
            return Math.ceil(inputsObject[element.split('/')[0]] / element.split('/')[1]);
        } if (element.includes('*')) {
            return inputsObject[element.split('*')[0]] * element.split('*')[1];
        }

        return inputsObject[element];
    }

    _parseConstans(constant) {
        let multiplier = 1;
        if (constant.includes('*')) {
            multiplier = constant.split('*')[0];
            constant = constant.split('*')[1];
        }
        this._reduceCounters(Number(virtualCountersFile.constants[constant].slice(0, -1)) * multiplier, virtualCountersFile.constants[constant].slice(-1));
    }

    _reduceCounters(amount, counterType) {
        if (isNaN(amount)) this._throwError(`Invalid amount ${amount}`);
        if (!this.currentCounters[counterType]) this._throwError(`Invalid counter type ${counterType}`);
        this.currentCounters[counterType].amount -= amount;
        this._verbose(`Reducing ${this.currentCounters[counterType].name} by ${amount} -> current amount: ${this.currentCounters[counterType].amount}`);
        this._checkCounter(counterType);
    }

    _checkCounter(counterType) {
        if (this.currentCounters[counterType].amount <= 0) {
            this._throwError(`Out of counters ${this.currentCounters[counterType].name}`);
        }
    }

    _throwError(message) {
        throw new Error(message);
    }

    _verbose(message) {
        if (this.verbose) {
            console.log(message);
        }
    }

    getCurrentSpentCounters() {
        const spentCounters = {};
        Object.keys(this.currentCounters).forEach((counter) => {
            spentCounters[this.currentCounters[counter].name] = this.currentCounters[counter].initAmount - this.currentCounters[counter].amount;
        });
        this._verbose(spentCounters);

        return spentCounters;
    }
};
