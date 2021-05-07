# -*- coding: utf-8 -*-
import re
import datetime
import json

#Remove string from the chat 
def removeStrings (lines):
    cleanChat = []
    for line in lines:
     splitline= line.split()
     if 'הוסיף/ה' not in splitline:
      cleanChat.append(line)
    return cleanChat

def CleanNamesAndNumber(lines):
    cleanList = []
    index=1
    dic = dict()
    for line in lines:
       indent = re.findall('[0-9]+ - (.+): ', line)[0]
       if indent not in dic:
           dic[indent] = index
           index= index+1
       line = line.replace(indent, str(dic[indent]))
       cleanList.append(line)
    return cleanList

def FindNumOfParticipate(lines):
    dic = dict()
    for line in lines:
       indent = re.findall('[0-9]+ - (.+): ', line)[0]
       if indent not in dic:
            dic[indent] = 1 
    return len(dic)

def buildFirstDic(lines):
    listOfDic = []
    for line in lines:
        date = line.split("-")[0].strip()
        text = line.split("-")[1].split(":")[1].strip().replace("\n","")
        indent = line.split('-')[1].split(":")[0].strip()
        dicline = {'datetime': date , 'text':text ,'id':indent}
        listOfDic.append(dicline)
    return listOfDic

        
def combainLines(lines):
    for i in range(len(lines)):
        hasDate = True
        try:
           datetime.datetime.strptime(lines[i].split(',')[0], '%d.%m.%Y')
           hasDate= True
        except ValueError:
            hasDate= False
        if hasDate == False:
         lines[i-1] = lines[i-1] + ' ' + lines[i] #concat two raws
         lines[i] = "needToRemove" #Mark raws that need to be removed
         
    for i in range(len(lines)):
        try:
            lines.remove("needToRemove")
        except ValueError:
            break
    return lines
        
#Start
with open('whatsapp.txt',encoding='utf8') as f:
    lines = []
    lines = f.readlines()
    Startchat = lines[2:] #Two first raws not part from the chat
    chatWithOneLines = combainLines(Startchat)
    cleanChat = removeStrings(chatWithOneLines) #Now the chat is clean
    NumOfParticipate = FindNumOfParticipate(cleanChat)
    anoynmousChat = CleanNamesAndNumber(cleanChat)
    messegeDic = buildFirstDic(anoynmousChat)
    creation_date= lines[1].split(",")[0]
    chat_name = lines[1].split('"')[1]
    linelen=len(lines[1].split())
    creator = lines[1].split()[linelen-2]+" "+lines[1].split()[linelen-1]
    metaDataDic={'chat_name':chat_name,'creation_date':creation_date, 'num_of_participants': NumOfParticipate, 'creator' : creator}
    combainDic={'metadata': metaDataDic, 'messages': messegeDic}
   
    #Print to file
file=open(chat_name+'.txt',"w",encoding="utf8")
json.dump(combainDic,file,ensure_ascii=False,indent=6)
file.close()