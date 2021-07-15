const { getData } = require('./csvImporter')
const converter = require('json-2-csv')
var cheerio = require('cheerio')
const sizeOf = require('image-size')
​
const buildCSVWithCallback = async (id, callback) => {
  console.log('Entered bild pdf callback')
  let error = false
  let errorMsg = ''
  let totalMarks = 0
  getData(id)
    .then(async data => {
      if (data.error) {
        callback(null, data.error, data.errorMsg)
      } else {
        // console.log("result:",data);
        // console.log("result data",JSON.stringify(data.paperData));
        const subject = data.paperData.subject[0]
        const grade = data.paperData.gradeLevel[0]
        const examName = data.paperData.name
  
        data.sectionData.forEach(d => {
          d.questions.forEach((element, index) => {
            const marks = parseInt(d.section.children[index].marks)
            if (!isNaN(marks)) totalMarks += marks
          })
        })
​
        const questionPaperContent = []
        let questionCounter = 0
        for (const d of data.sectionData) {
          const section = d.section
        
          for (const [index, question] of d.questions.entries()) {
            questionCounter += 1
            let questionContent
            let blooms  
            let learningOutcome
           
            if (question.category === 'MCQ') {
               if(question.learningOutcome === undefined) {
                 learningOutcome = ""
               } else {
                 learningOutcome = question.learningOutcome[0]
               }
​
               if(question.bloomslevel === undefined) {
                blooms = ""
              } else {
                blooms = question.bloomslevel[0]
              }
               questionContent = await renderMCQ(
                question,
                questionCounter,
                grade,
                subject,
                examName,
                learningOutcome,
                blooms
              )
              
                questionPaperContent.push(questionContent)
            }
          }
        }
        console.log("Final Json:", questionPaperContent);
        // convert JSON array to CSV string
        converter
          .json2csvAsync(questionPaperContent)
          .then(csv => {
            callback(csv, error, errorMsg)
          })
          .catch(err => console.log(err))
      }
    })
    .catch(e => {
      console.log(e)
      error = true
      errorMsg = ''
      callback(null, error, errorMsg)
    })
}
​
const cleanHTML = (str, nbspAsLineBreak = false) => {
  // Remove HTML characters since we are not converting HTML to PDF.
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, nbspAsLineBreak ? '\n' : '')
}
​
const detectLanguage = str => {
  const unicodeBlocks = [
    {
      name: 'Tamil',
      regex: /[\u0B80-\u0BFF]+/g
    },
    {
      name: 'Hindi',
      regex: /[\u0900-\u097F]+/g
    }
  ]
​
  let language = 'English'
​
  const langSplit = {
    Hindi: 0,
    Tamil: 0,
    English: 0,
    Undefined: 0
  }
  if (typeof str === 'string') {
    str.split('').forEach(letter => {
      let found = false
      unicodeBlocks.forEach(block => {
        if (letter.match(block.regex)) {
          langSplit[block.name]++
          found = true
        }
      })
      if (!found) {
        langSplit.English++
      }
    })
​
    let max = 0
    for (var key of Object.keys(langSplit)) {
      if (langSplit[key] > max) {
        max = langSplit[key]
        language = key
      }
    }
​
    return language
  }
  return 'English'
}
​
function extractTextFromElement (elem) {
  let rollUp = ''
  if (cheerio.text(elem)) return cheerio.text(elem)
  else if (elem.name === 'sup')
    return { text: elem.children[0].data, sup: true }
  else if (elem.name === 'sub')
    return { text: elem.children[0].data, sub: true }
  else if (elem.type === 'text' && elem.data) return elem.data
  else {
    if (elem.children && elem.children.length) {
      for (const nestedElem of elem.children) {
        let recurse = extractTextFromElement(nestedElem)
        if (Array.isArray(rollUp)) {
          rollUp.push(recurse)
        } else {
          if (Array.isArray(recurse)) {
            rollUp = recurse
          } else if (typeof recurse === 'object') {
            rollUp = [rollUp, recurse]
          } else rollUp += recurse
        }
      }
    }
  }
  return rollUp
}
​
async function getStack (htmlString, questionCounter) {
  const stack = []
  let count =  0;
  $ = cheerio.load(htmlString)
  const elems = $('body')
    .children()
    .toArray()
    // console.log("ele:",elems);
  for (const [index, elem] of elems.entries()) {
    let nextLine = ''
    switch (elem.name) {
      case 'p':
        let extractedText = extractTextFromElement(elem)
        // Returns array if superscript/subscript inside
        if (Array.isArray(extractedText)){
          nextLine = { text: extractedText }
        } 
        else {
          nextLine += extractedText
          nextLine = {text: nextLine}
        }
        // console.log("para:",nextLine);
        break
      case 'ol':
        nextLine = {
          ol: elem.children.map(
            el =>
              el.children[0] &&
              (el.children[0].data ||
                (el.children[0].children[0] && el.children[0].children[0].data))
          )
        }
        break
      case 'ul':
        nextLine = {
          ul: elem.children.map(
            el =>
              el.children[0] &&
              (el.children[0].data ||
                (el.children[0].children[0] && el.children[0].children[0].data))
          )
        }
        break
      case 'figure':
        if(count === 0){
        let { style } = elem.attribs
        let width = 1
        if (style) {
          width = parseFloat(
            style
              .split(':')
              .pop()
              .slice(0, -2)
          )
          width = width / 100
        }
        
        if (elem.children && elem.children.length) {
          let { src } = elem.children[0].attribs
          if(!src.startsWith("data:image/png")){
            count++
            nextLine =  `${envVariables.baseURL}`+src
          }
        }
        if (!nextLine)
          nextLine = '<An image of an unsupported format was scrubbed>'
      }
        break
    }
    if (index === 0 && questionCounter) {
      if (elem.name === 'p') {
        if (typeof nextLine === 'object')
          nextLine = { text: `${questionCounter}. ${nextLine.text}`,  }
        else
         nextLine = `${questionCounter}. ${nextLine}`
      } else stack.push(`${questionCounter}. ${nextLine}`)
    }
    stack.push(nextLine)
  }
  return stack
}
​
async function renderMCQ (question, questionCounter, grade,subject,examName,learningOutcome,blooms) {
    // console.log("Question :",question);
  const questionOptions = [],
    answerOptions = ['A', 'B', 'C', 'D']
  let questionTitle
  let finalQuestion = ''
​
  for (const [index, qo] of question.editorState.options.entries()) {
    let qoBody = qo.value.body
    let qoData =
      qoBody.search('img') >= 0 ||
      qoBody.search('sup') >= 0 ||
      qoBody.search('sub') >= 0 ||
      qoBody.match(/<p>/g).length > 1
        ? await getStack(qoBody, answerOptions[index])
        : [`${answerOptions[index]}. ${cleanHTML(qoBody)}`]
    questionOptions.push(qoData)
  }
  let q = question.editorState.question
  count = 0
  questionTitle =
    q.search('img') >= 0 ||
    q.search('sub') >= 0 ||
    q.search('sup') >= 0 ||
    q.match(/<p>/g).length > 1
      ? await getStack(q, questionCounter)
      : [`${questionCounter}. ${cleanHTML(q)}`]
​
  let answer = ''
  for (const option of question.options) {
    if (option.answer === true) {
      answer = option.value.resindex + 1
    }
  }
  
    for (let que of questionTitle){
      if(typeof que === "object"){
        finalQuestion += que.text
      }
    }
​
  let data = {
    "Class" : grade,
    "Subject" : subject,
    "TopicName" : examName,
    "Questions": finalQuestion,
    'Option1': questionOptions[0][0],
    'Option2': questionOptions[1][0],
    'Option3': questionOptions[2][0],
    'Option4': questionOptions[3][0],
    'CorrectAnswer(1/2/3/4)': answer,
    'Competense': learningOutcome,
    'Skills': blooms,
    'Question attachment url':questionTitle[questionTitle.length -1]
  }
  return data
}
​
module.exports = {
  buildCSVWithCallback
}