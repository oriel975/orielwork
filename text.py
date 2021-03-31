# -*- coding: utf-8 -*-
"""
Created on Tue Mar 30 11:23:46 2021

@author: User
"""
 
def revword(word):
    return word[::-1].lower()

print(revword("LIraZ")) #yty

def countword():
   with open("text.txt", "r") as a_file:
    word = a_file.readline().strip()
    # print("woedgeneral",word)
     #  print("firstline", first_line)
    counter=1
    for line in a_file:   
     stripped_line = line.strip()
     split_line=stripped_line.split()
     #word = split_line[0].lower()
     #print(word)
     outpot_line=list(map(revword,split_line))
     print("outputline", outpot_line)

     for itrated_word in outpot_line:
      #   word = "first"
         #word="first"
        # print("word", word)
       #  print ("itreted",itrated_word)
        # print ("liraztest")
        # print(itrated_word == word)
         if itrated_word == word:
             counter=counter+1
     #print(outpot_line)
  
   return counter

  #   print(split_line)
  #  print(stripped_line)
     
#print(countword())