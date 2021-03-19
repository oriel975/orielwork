# -*- coding: utf-8 -*-
print("Start")


def XtimesY(x,y):
    if x <= 0:
        return 0.0
    return exponent(y*Ln(x))


def myfactorial(x):
    fac = 1
    i = 1
    while i <= x:
        fac = fac * i
        i = i + 1  
    return fac
 

def mypow(x,y):
    ans = 1
    for n in range(y):
        ans=ans*x
  #  print ("mypow",ans)    
    return ans

#def exponent(x):
#    exp = x
#    result = 1 + x
#    i = 2
#    while i < 100:
#        x *= exp
#        result += (x/myfactorial(i))
#        i += 1
#    return result

def exponent(x):
    ans = 1 + x
    for n in range (2,100):
        x_pow = mypow(x,n)
        ans += (x_pow/myfactorial(n))
    return ans


#def Ln(x):
#    if x <= 0:
#        return 0.0
#    Epsilon = 0.001
#    y = x - 1.0
#    result = y
#    while True:
#        new_y = y + 2 * ((x - exponent1(y)) / (x + exponent1(y)))
#        result = new_y
#        dif = new_y - y
#        if dif < 0:
#            dif = dif * (-1)
#        if dif <= Epsilon:
#            return result
#        y = new_y   
        
def calcAbs(x,y):
    remainder = x - y
    if remainder < 0:
       return remainder * (-1)
    return remainder
        
def Ln(x):
    if x <= 0:
         return 0.0
    yn = x - 1.0
    while True:
        yn1 = yn + 2 * ((x - exponent(yn)) / (x + exponent(yn)))
        if (calcAbs(yn1,yn)) <= 0.001:
            return yn1
        yn = yn1
        
def sqrt(x,y):
    if y <= 0:
        return 0.0
    return XtimesY(y,1/x)
     

def calculate(x):
    if x <= 0:
        return 0.0
    return (exponent(x) * XtimesY(7,x) * XtimesY(x,-1) * sqrt(x,x))
 
#print (mypow(2,2))        
#print(myfactorial(4))        
#print (XtimesY(2,2))
#print(exponent(2))
#print(exponent(2.0))
#print (calculate(2))
#print (sqrt(2,9))
